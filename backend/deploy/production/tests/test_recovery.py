"""Durable cluster simulations: recovery must prove ownership before mutation."""
import argparse
import contextlib
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import orchestrate
import recovery
import release_log

OLD = 'prod-20261030-41006406106-a1'
INCIDENT_A = 'prod-20261103-41666137769-a1'
INCIDENT_B = 'prod-20261103-41674776379-a1'
INCIDENT_C = 'prod-20261103-41675891256-a1'


def manifest(release_id, migration='same'):
    return {'release_id': release_id, 'migration_hash': migration,
            'rollback_compatible': True, 'domain': 'api.example.com',
            'app_image': 'ghcr.io/duyaivy/handy_go@sha256:' + 'a' * 64}


def pending(transaction, phase='SNAPSHOT', previous=OLD, target=None):
    return {'transaction': transaction, 'target': target or transaction,
            'previous': {'release_id': previous} if previous else None,
            'phase': phase, 'touched': phase != 'SNAPSHOT'}


class Cluster:
    """Mock SSH at the durable operation boundary, with owner checks and failures."""
    def __init__(self, directory, transaction=INCIDENT_B):
        self.calls = []
        self.states = {role: {'role': role, 'stable': {'release_id': OLD}, 'pending': None,
                             'manifests': {OLD: manifest(OLD)}, 'token': role}
                       for role in orchestrate.ROLES}
        self.fail = {}
        self.before = {}
        self.inspection_error = None
        self.inspections = 0
        c = orchestrate.Coordinator.__new__(orchestrate.Coordinator)
        c.args = argparse.Namespace(rollback_release='', run_migrations=False, domain='api.example.com')
        c.transaction = c.target = transaction
        c.output = directory
        c.journal = {'hosts': {}, 'rollback': {}, 'status': 'PREPARING',
                     'transaction': transaction, 'target_release': transaction}
        c.cluster_lock = contextlib.nullcontext
        c.inspect_cluster = self.inspect
        c.remote = self.remote
        c.public_smoke = Mock()
        c.bundle = Mock(side_effect=self.bundle)
        c.ssh_run = Mock(return_value=b'')
        self.c = c

    def bundle(self):
        value = manifest(self.c.target)
        for state in self.states.values():
            state['manifests'][self.c.target] = copy.deepcopy(value)
        return value, b'archive'

    def own(self, role, transaction=INCIDENT_A, phase='SNAPSHOT', previous=OLD, target=None):
        p = pending(transaction, phase, previous, target)
        state = self.states[role]
        state['pending'] = p
        state['manifests'][p['target']] = manifest(p['target'])
        if previous is None:
            state['stable'] = None
        if phase == 'COMMITTED':
            state['stable'] = {'release_id': p['target']}
        return p

    def inspect(self):
        self.inspections += 1
        if self.inspection_error:
            raise self.inspection_error
        snapshot = copy.deepcopy(self.states)
        self.c.states = snapshot
        return snapshot

    def remote(self, role, action, target=None, wait_lock=False):
        target = target or self.c.target
        self.calls.append((role, action, target, self.c.transaction))
        if (role, action) in self.before:
            self.before[(role, action)]()
        if (role, action) in self.fail:
            raise self.fail[(role, action)]
        state = self.states[role]
        p = state['pending']
        if action == 'begin':
            if p:
                raise RuntimeError('Unfinished transaction exists')
            old = (state['stable'] or {}).get('release_id')
            p = self.own(role, self.c.transaction, previous=old, target=target)
            result = {'previous': p['previous'], 'previous_manifest': state['manifests'].get(old),
                      'migration_hash': state['manifests'][old]['migration_hash'] if old else None}
        elif action == 'verify':
            result = {'verified': True}
        else:
            if not p or (p['transaction'], p['target']) != (self.c.transaction, target):
                raise RuntimeError('No matching transaction')
            if action == 'restore':
                if not p['touched']:
                    result = {'rollback': 'NOT_NEEDED'}
                elif not p['previous']:
                    result = {'rollback': 'NO_PREVIOUS_RELEASE'}
                else:
                    p['phase'] = 'RESTORED'
                    state['stable'] = copy.deepcopy(p['previous'])
                    result = {'rollback': 'RESTORED', 'release_id': p['previous']['release_id']}
            elif action == 'apply':
                p.update(phase='VERIFIED', touched=True)
                result = {'verified': True}
            elif action == 'commit':
                p['phase'] = 'COMMITTED'
                state['stable'] = {'release_id': target}
                result = {'committed': True}
            elif action == 'authorize-finish':
                result = {'authorized': True}
            elif action == 'finish':
                state['pending'] = None
                result = {'unlocked': True}
            else:
                result = {}
        self.c.journal['hosts'].setdefault(role, {})[action] = result
        return result

    def actions(self, action):
        return [call for call in self.calls if call[1] == action]


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.cluster = Cluster(self.root / 'output')
        self.c = self.cluster.c

    def reconcile(self, **kwargs):
        return recovery.reconcile(self.c, **kwargs)

    def assert_locked(self, *roles):
        self.assertFalse(self.cluster.actions('finish'))
        for role in roles:
            self.assertIsNotNone(self.cluster.states[role]['pending'])

    def test_no_pending_on_all_three_hosts_does_not_mutate(self):
        self.reconcile()
        self.assertEqual(self.c.journal['status'], 'RECOVERY_NOT_NEEDED')
        self.assertEqual(self.cluster.calls, [])
        self.c.public_smoke.assert_not_called()

    def test_untouched_snapshot_verified_then_finished_without_restore(self):
        self.cluster.own('vps3')
        self.reconcile()
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual(len(self.cluster.actions('verify')), 3)
        self.assertEqual(len(self.cluster.actions('finish')), 1)
        self.assertIsNone(self.cluster.states['vps3']['pending'])

    def test_snapshot_with_no_previous_is_safe_if_pristine_cluster(self):
        for state in self.cluster.states.values():
            state['stable'] = None
        self.cluster.own('vps3', previous=None)
        self.reconcile()
        self.assertEqual(len(self.cluster.actions('finish')), 1)
        self.assertFalse(self.cluster.actions('restore'))
        self.assertFalse(self.cluster.actions('verify'))

    def test_restored_state_requires_whole_cluster_and_public_verification(self):
        self.cluster.own('vps3', phase='RESTORED')
        self.reconcile()
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual({call[0] for call in self.cluster.actions('verify')}, set(orchestrate.ROLES))
        self.c.public_smoke.assert_called_once_with(manifest(OLD))
        self.assertEqual(self.cluster.calls[-1][1], 'finish')

    def test_public_verification_failure_preserves_restored_journal(self):
        self.cluster.own('vps3', phase='APPLYING')
        self.c.public_smoke.side_effect = RuntimeError('HTTPS failed')
        with self.assertRaisesRegex(RuntimeError, 'HTTPS'):
            self.reconcile()
        self.assertEqual(self.cluster.states['vps3']['pending']['phase'], 'RESTORED')
        self.assert_locked('vps3')

    def test_unowned_host_health_failure_also_prevents_unlock(self):
        self.cluster.own('vps3', phase='RESTORED')
        self.cluster.fail['vps1', 'verify'] = RuntimeError('Gateway unhealthy')
        with self.assertRaisesRegex(RuntimeError, 'unhealthy'):
            self.reconcile()
        self.assert_locked('vps3')

    def test_all_committed_verified_without_rollback(self):
        for role in orchestrate.ROLES:
            self.cluster.own(role, phase='COMMITTED')
        self.reconcile()
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual(len(self.cluster.actions('finish')), 3)
        self.assertTrue(all(call[2] == INCIDENT_A for call in self.cluster.actions('verify')))
        self.assertEqual(self.c.journal['status'], 'STABLE')

    def test_commit_crash_after_stable_write_completes_matching_commit(self):
        for role in orchestrate.ROLES:
            self.cluster.own(role, phase='COMMITTED')
        self.cluster.states['vps2']['pending']['phase'] = 'VERIFIED'
        self.reconcile()
        self.assertEqual([call[0] for call in self.cluster.actions('commit')], ['vps2'])
        self.assertFalse(self.cluster.actions('restore'))

    def test_partial_commit_restores_previous_exact_release_on_every_participant(self):
        self.cluster.own('vps3', phase='COMMITTED')
        for role in ('vps2', 'vps1'):
            self.cluster.own(role, phase='VERIFIED')
        self.reconcile()
        self.assertEqual(len(self.cluster.actions('restore')), 3)
        self.assertTrue(all(s['stable'] == {'release_id': OLD} for s in self.cluster.states.values()))
        self.assertTrue(all(call[2] == OLD for call in self.cluster.actions('verify')))

    def test_unlocked_partial_commit_is_not_silently_downgraded(self):
        self.cluster.own('vps3', phase='VERIFIED')
        self.cluster.states['vps2']['stable'] = {'release_id': INCIDENT_A}
        with self.assertRaisesRegex(RuntimeError, 'unlocked host'):
            self.reconcile()
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')

    def test_explicit_owner_or_target_mismatch_refuses_all_mutation(self):
        self.cluster.own('vps3')
        for expected in ((INCIDENT_B, INCIDENT_A), (INCIDENT_A, INCIDENT_B)):
            with self.subTest(expected=expected), self.assertRaisesRegex(RuntimeError, 'owner/target'):
                self.reconcile(expected=expected)
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')

    def test_missing_previous_bundle_fails_closed(self):
        self.cluster.own('vps3', phase='APPLYING')
        del self.cluster.states['vps2']['manifests'][OLD]
        with self.assertRaises(KeyError):
            self.reconcile()
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')

    def test_migration_hash_mismatch_blocks_automatic_and_manual_restore(self):
        self.cluster.own('vps3', phase='APPLYING')
        self.cluster.states['vps3']['manifests'][INCIDENT_A]['migration_hash'] = 'new-schema'
        for automatic in (True, False):
            with self.subTest(automatic=automatic), self.assertRaisesRegex(RuntimeError, 'migration compatibility'):
                self.reconcile(automatic=automatic)
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')

    def test_incident_a_wallet_unhealthy_old_broker_preserves_original_transaction(self):
        self.cluster.own('vps3', INCIDENT_A, phase='APPLYING')
        self.cluster.fail['vps3', 'restore'] = RuntimeError('Wallet unhealthy; previous RabbitMQ refused AMQP')
        with self.assertRaisesRegex(RuntimeError, 'Wallet unhealthy'):
            self.reconcile()
        self.assert_locked('vps3')
        self.assertEqual(self.cluster.states['vps3']['pending']['transaction'], INCIDENT_A)
        self.assertEqual(self.c.journal['status'], 'MANUAL_INTERVENTION_REQUIRED')

    def test_runner_cancelled_between_apply_and_commit_restores_safe_snapshot(self):
        for role, phase in zip(orchestrate.ROLES, ('VERIFIED', 'APPLYING', 'SNAPSHOT')):
            self.cluster.own(role, phase=phase)
        self.reconcile()
        self.assertEqual(len(self.cluster.actions('restore')), 3)
        self.assertEqual(len(self.cluster.actions('finish')), 3)
        self.assertFalse(self.cluster.actions('commit'))

    def test_recovery_retried_twice_is_idempotent(self):
        self.cluster.own('vps3', phase='RESTORED')
        self.reconcile()
        original_calls = list(self.cluster.calls)
        self.reconcile()
        self.assertEqual(self.cluster.calls, original_calls)
        self.assertEqual(self.c.journal['status'], 'RECOVERY_NOT_NEEDED')

    def test_failed_finish_can_be_retried_without_repeating_restore(self):
        for role in orchestrate.ROLES:
            self.cluster.own(role, phase='RESTORED')
        self.cluster.fail['vps2', 'finish'] = RuntimeError('SSH timed out')
        with self.assertRaisesRegex(RuntimeError, 'SSH timed out'):
            self.reconcile()
        self.assertIsNone(self.cluster.states['vps3']['pending'])
        del self.cluster.fail['vps2', 'finish']
        self.reconcile()
        self.assertFalse(self.cluster.actions('restore'))
        self.assertTrue(all(s['pending'] is None for s in self.cluster.states.values()))

    def test_inspect_mode_never_mutates_or_runs_live_probes(self):
        self.cluster.own('vps3', phase='APPLYING')
        self.reconcile(inspect_only=True)
        self.assertEqual(self.cluster.calls, [])
        self.c.public_smoke.assert_not_called()
        self.assertEqual(self.c.journal['status'], 'RECOVERY_REQUIRED')

    def test_bootstrap_failure_has_no_automatic_unlock(self):
        for state in self.cluster.states.values():
            state['stable'] = None
        self.cluster.own('vps3', phase='BOOTSTRAP_FAILED', previous=None)
        with self.assertRaisesRegex(RuntimeError, 'bootstrap'):
            self.reconcile()
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')

    def test_ssh_failure_before_inspection_finishes_cannot_mutate_any_host(self):
        self.cluster.own('vps3')
        self.cluster.inspection_error = RuntimeError('VPS2 unreachable')
        with self.assertRaisesRegex(RuntimeError, 'unreachable'):
            self.c.execute()
        self.assertEqual(self.cluster.calls, [])
        self.c.bundle.assert_not_called()
        self.c.ssh_run.assert_not_called()
        self.assert_locked('vps3')

    def test_incident_c_old_safe_pending_finished_before_new_deploy_begins(self):
        self.c.transaction = self.c.target = INCIDENT_C
        self.cluster.own('vps3', INCIDENT_B)
        with patch.object(orchestrate.time, 'sleep'):
            self.c.execute()
        first_begin = next(i for i, call in enumerate(self.cluster.calls) if call[1] == 'begin')
        previous_finish = next(i for i, call in enumerate(self.cluster.calls)
                               if call[1] == 'finish' and call[3] == INCIDENT_B)
        self.assertLess(previous_finish, first_begin)
        self.assertTrue(all(call[3] == INCIDENT_C for call in self.cluster.actions('begin')))
        self.assertEqual(self.c.journal['status'], 'STABLE')
        self.assertTrue(all(s['pending'] is None for s in self.cluster.states.values()))

    def test_three_preexisting_snapshot_owners_are_reconciled_before_new_begin(self):
        for role, owner in zip(orchestrate.ROLES, (INCIDENT_A, INCIDENT_B, INCIDENT_C)):
            self.cluster.own(role, owner)
        next_transaction = 'prod-20261104-41680000000-a1'
        self.c.transaction = self.c.target = next_transaction
        with patch.object(orchestrate.time, 'sleep'):
            self.c.execute()
        first_begin = next(i for i, call in enumerate(self.cluster.calls) if call[1] == 'begin')
        old_finishes = [i for i, call in enumerate(self.cluster.calls)
                        if call[1] == 'finish' and call[3] != next_transaction]
        self.assertEqual(len(old_finishes), 3)
        self.assertTrue(all(i < first_begin for i in old_finishes))
        self.assertEqual(self.c.journal['status'], 'STABLE')
        self.assertFalse(self.cluster.actions('restore'))

    def test_preflight_reconciliation_retries_are_bounded_if_no_progress(self):
        self.cluster.own('vps3')
        with patch.object(recovery, 'reconcile') as reconcile_mock:
            with self.assertRaisesRegex(RuntimeError, 'bounded reconciliation'):
                self.c.preflight()
        self.assertEqual(reconcile_mock.call_count, len(orchestrate.ROLES) + 1)
        self.assertEqual(self.cluster.calls, [])
        self.assertEqual((self.c.transaction, self.c.target), (INCIDENT_B, INCIDENT_B))

    def test_foreign_mutated_journal_and_failed_public_smoke_keep_both_owners(self):
        self.cluster.own('vps3', INCIDENT_B)
        self.cluster.own('vps2', INCIDENT_A, phase='APPLYING')
        self.c.public_smoke.side_effect = RuntimeError('Public HTTPS unavailable')
        with self.assertRaisesRegex(RuntimeError, 'HTTPS unavailable'):
            self.reconcile(expected=(INCIDENT_B, INCIDENT_B))
        self.assert_locked('vps3', 'vps2')
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual(self.cluster.states['vps2']['pending']['phase'], 'APPLYING')

    def test_cancellation_during_later_begin_reconciles_only_confirmed_journals(self):
        self.cluster.fail['vps2', 'begin'] = KeyboardInterrupt('Runner cancelled')
        with self.assertRaisesRegex(RuntimeError, 'FAILED_ROLLBACK_SUCCESS'):
            self.c.execute()
        self.assertEqual([call[0] for call in self.cluster.actions('begin')], ['vps3', 'vps2'])
        self.assertEqual([call[0] for call in self.cluster.actions('finish')], ['vps3'])
        self.assertFalse(self.cluster.actions('apply'))
        self.assertFalse(self.cluster.actions('restore'))
        self.assertIn('Runner cancelled', self.c.journal['error'])

    def test_old_unsafe_pending_blocks_new_begin_and_staging(self):
        self.cluster.own('vps3', INCIDENT_A, phase='APPLYING')
        with self.assertRaisesRegex(RuntimeError, 'RECOVERY_REQUIRED'):
            self.c.execute()
        self.assertFalse(self.cluster.actions('restore'))
        self.assertFalse(self.cluster.actions('begin'))
        self.c.bundle.assert_not_called()
        self.c.ssh_run.assert_not_called()
        self.assert_locked('vps3')

    def test_incident_b_foreign_pending_after_first_begin_never_restored_as_new_owner(self):
        foreign = pending(INCIDENT_A, 'APPLYING')
        self.cluster.before['vps2', 'begin'] = lambda: self.cluster.own('vps2', INCIDENT_A, phase='APPLYING')
        with self.assertRaisesRegex(RuntimeError, 'FAILED_NEEDS_INTERVENTION'):
            self.c.execute()
        self.assertEqual(self.cluster.states['vps2']['pending'], foreign)
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual([(call[0], call[3]) for call in self.cluster.actions('finish')], [('vps3', INCIDENT_B)])
        self.assertIsNone(self.cluster.states['vps3']['pending'])
        self.assertIsNotNone(self.cluster.states['vps2']['pending'])
        self.assertEqual(len(self.cluster.actions('verify')), 3)
        self.assertEqual(self.c.journal['ownership']['vps3'], 'OWNED')
        self.assertEqual(self.c.journal['ownership']['vps2'], 'FOREIGN_OWNER')
        self.assertIn('Unfinished transaction', self.c.journal['error'])

    def test_incident_b_unhealthy_previous_blocks_even_untouched_own_cleanup(self):
        self.cluster.before['vps2', 'begin'] = lambda: self.cluster.own('vps2', INCIDENT_A, phase='APPLYING')
        self.cluster.fail['vps2', 'verify'] = RuntimeError('Previous service unhealthy')
        with self.assertRaisesRegex(RuntimeError, 'FAILED_NEEDS_INTERVENTION'):
            self.c.execute()
        self.assert_locked('vps3', 'vps2')
        self.assertFalse(self.cluster.actions('restore'))

    def test_begin_timeout_after_remote_journal_write_is_reconciled_by_owner(self):
        self.cluster.before['vps2', 'begin'] = lambda: self.cluster.own('vps2', INCIDENT_B)
        self.cluster.fail['vps2', 'begin'] = RuntimeError('SSH timed out')
        with self.assertRaisesRegex(RuntimeError, 'FAILED_ROLLBACK_SUCCESS'):
            self.c.execute()
        self.assertEqual({call[0] for call in self.cluster.actions('finish')}, {'vps3', 'vps2'})
        self.assertEqual(self.c.journal['ownership']['vps2'], 'OWNED')
        self.assertFalse(self.cluster.actions('apply'))
        self.assertFalse(self.cluster.actions('restore'))

    def test_begin_failure_before_pending_does_not_add_false_participant(self):
        self.cluster.fail['vps2', 'begin'] = RuntimeError('Begin rejected before write')
        with self.assertRaisesRegex(RuntimeError, 'FAILED_ROLLBACK_SUCCESS'):
            self.c.execute()
        self.assertEqual([call[0] for call in self.cluster.actions('finish')], ['vps3'])
        self.assertEqual(self.c.journal['ownership']['vps2'], 'NO_JOURNAL')
        self.assertFalse(self.cluster.actions('apply'))

    def test_changed_owner_during_verification_cannot_be_unlocked(self):
        self.cluster.own('vps3', phase='RESTORED')
        self.c.public_smoke.side_effect = lambda _: self.cluster.own('vps3', INCIDENT_C)
        with self.assertRaisesRegex(RuntimeError, 'ownership changed'):
            self.reconcile()
        self.assert_locked('vps3')
        self.assertEqual(self.cluster.states['vps3']['pending']['transaction'], INCIDENT_C)

    def test_changed_stable_during_verification_cannot_be_unlocked(self):
        self.cluster.own('vps3', phase='RESTORED')
        def race(_):
            self.cluster.states['vps1']['stable'] = {'release_id': INCIDENT_C}
        self.c.public_smoke.side_effect = race
        with self.assertRaisesRegex(RuntimeError, 'stable changed'):
            self.reconcile()
        self.assert_locked('vps3')

    def test_no_pending_but_inconsistent_stable_metadata_blocks_deploy(self):
        self.cluster.states['vps2']['manifests'][OLD]['migration_hash'] = 'different'
        with self.assertRaisesRegex(RuntimeError, 'stable metadata'):
            self.c.execute()
        self.assertEqual(self.cluster.calls, [])
        self.c.bundle.assert_not_called()

    def test_concurrent_coordinator_lock_rejection_prevents_inspection_and_begin(self):
        self.c.ssh = ['ssh']
        self.c.identities = {'vps3': '/mock/key'}
        self.c.targets = {'vps3': 'deployer@mock-host'}
        self.c.cluster_lock = lambda: orchestrate.Coordinator.cluster_lock(self.c)
        process = Mock()
        process.stdout.readline.return_value = b''
        with patch.object(orchestrate.subprocess, 'Popen', return_value=process), \
                patch.object(orchestrate.select, 'select', return_value=([process.stdout], [], [])):
            with self.assertRaisesRegex(RuntimeError, 'cluster lock unavailable'):
                self.c.execute()
        self.assertEqual(self.cluster.inspections, 0)
        self.assertEqual(self.cluster.calls, [])
        self.c.bundle.assert_not_called()
        process.stdin.close.assert_called_once()

    def test_lost_cluster_lock_session_fences_next_remote_command(self):
        self.c.lock_process = Mock()
        self.c.lock_process.poll.return_value = 255
        with patch.object(orchestrate.subprocess, 'run') as subprocess_run:
            with self.assertRaisesRegex(RuntimeError, 'coordinator fenced'):
                orchestrate.Coordinator.ssh_run(self.c, 'vps2', 'unused command')
        subprocess_run.assert_not_called()

    def test_inspection_attempts_all_hosts_and_preserves_failure_evidence(self):
        def inspect(role, action):
            self.assertEqual(action, 'inspect')
            if role == 'vps2':
                raise RuntimeError('SSH unreachable')
            return copy.deepcopy(self.cluster.states[role])
        self.c.executor = Mock(side_effect=inspect)
        with self.assertRaisesRegex(RuntimeError, 'cluster inspection failed'):
            orchestrate.Coordinator.inspect_cluster(self.c)
        self.assertEqual([call.args[0] for call in self.c.executor.call_args_list], list(orchestrate.ROLES))
        self.assertEqual(self.c.journal['inspection_errors'], {'vps2': 'SSH unreachable'})
        self.assertEqual(self.cluster.calls, [])

    def test_recovery_errors_and_artifact_redact_loaded_secret(self):
        secret = 'previous-broker-password-DO-NOT-LOG'
        old_secrets = release_log.SECRETS.copy()
        self.addCleanup(lambda: (release_log.SECRETS.clear(), release_log.SECRETS.update(old_secrets)))
        env_file = self.root / 'previous.env'
        env_file.write_text('RABBITMQ_URL=amqps://old-user:' + secret + '@broker.example.com\n')
        release_log.load_secrets(env_file)
        self.cluster.own('vps3', phase='APPLYING')
        self.cluster.fail['vps3', 'restore'] = RuntimeError('Broker refused ' + secret)
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            with self.assertRaises(RuntimeError):
                self.reconcile()
        self.assertNotIn(secret, captured.getvalue())
        self.assertNotIn(secret, (self.c.output / 'execution.json').read_text())
        self.assertIn('[REDACTED]', self.c.journal['recovery_error'])
        self.assertEqual(env_file.read_text(), 'RABBITMQ_URL=amqps://old-user:' + secret + '@broker.example.com\n')

    def test_legacy_pending_snapshot_cluster_reconciliation(self):
        legacy = {'transaction': INCIDENT_A, 'target': INCIDENT_A,
                  'previous': {'release_id': OLD}, 'touched': False}
        self.cluster.states['vps3']['pending'] = legacy
        self.cluster.states['vps3']['manifests'][INCIDENT_A] = manifest(INCIDENT_A)
        self.reconcile()
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual(len(self.cluster.actions('verify')), 3)
        self.assertEqual(len(self.cluster.actions('finish')), 1)
        self.assertIsNone(self.cluster.states['vps3']['pending'])

    def test_recovery_cli_argument_validation(self):
        args = ['recovery.py', '--run-id', '123', '--attempt', '1',
                '--transaction', 'prod-20261103-999-a1', '--target', OLD,
                '--domain', 'api.example.com']
        with patch.object(sys, 'argv', args), self.assertRaises(SystemExit):
            recovery.main()

    def test_recovery_cli_executes_reconcile_with_expected(self):
        out_dir = self.root / 'cli-output'
        args = ['recovery.py', '--run-id', '123', '--attempt', '1',
                '--transaction', 'prod-20261103-123-a1', '--target', OLD,
                '--domain', 'api.example.com', '--output', str(out_dir)]
        with patch.object(sys, 'argv', args), \
                patch.object(recovery, 'Coordinator') as coord_cls, \
                patch.object(recovery, 'reconcile') as mock_reconcile:
            mock_c = Mock()
            mock_c.journal = {}
            mock_c.cluster_lock = contextlib.nullcontext
            coord_cls.return_value = mock_c
            recovery.main()
            mock_reconcile.assert_called_once_with(mock_c, expected=('prod-20261103-123-a1', OLD), inspect_only=True, abort_untouched=False)
            self.assertEqual(mock_c.transaction, 'prod-20261103-123-a1')
            self.assertEqual(mock_c.target, OLD)

    def test_recovery_cli_recover_flag_disables_inspect_only(self):
        out_dir = self.root / 'cli-output'
        args = ['recovery.py', '--run-id', '123', '--attempt', '1',
                '--transaction', 'prod-20261103-123-a1', '--target', OLD,
                '--domain', 'api.example.com', '--output', str(out_dir), '--recover']
        with patch.object(sys, 'argv', args), \
                patch.object(recovery, 'Coordinator') as coord_cls, \
                patch.object(recovery, 'reconcile') as mock_reconcile:
            mock_c = Mock()
            mock_c.journal = {}
            mock_c.cluster_lock = contextlib.nullcontext
            coord_cls.return_value = mock_c
            recovery.main()
            mock_reconcile.assert_called_once_with(mock_c, expected=('prod-20261103-123-a1', OLD), inspect_only=False, abort_untouched=False)

    def test_recovery_cli_abort_mode_is_explicit_and_excludes_recover(self):
        args = ['recovery.py', '--run-id', '123', '--attempt', '1',
                '--transaction', 'prod-20261103-123-a1', '--target', OLD,
                '--domain', 'api.example.com', '--abort-untouched']
        with patch.object(sys, 'argv', args), patch.object(recovery, 'Coordinator') as coord_cls, \
                patch.object(recovery, 'reconcile') as reconcile:
            coord_cls.return_value.cluster_lock = contextlib.nullcontext
            recovery.main()
            reconcile.assert_called_once_with(coord_cls.return_value,
                expected=('prod-20261103-123-a1', OLD), inspect_only=False, abort_untouched=True)
        with patch.object(sys, 'argv', args + ['--recover']), self.assertRaises(SystemExit):
            recovery.main()

    # TEST-01: Automatic untouched snapshot
    def test_test01_automatic_untouched_snapshot_safely_finished(self):
        self.cluster.own('vps3', phase='SNAPSHOT')
        self.reconcile(automatic=True)
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual(len(self.cluster.actions('verify')), 3)
        self.assertEqual(len(self.cluster.actions('finish')), 1)
        self.assertIsNone(self.cluster.states['vps3']['pending'])
        self.assertEqual(self.c.journal['status'], 'FAILED_ROLLBACK_SUCCESS')

    # TEST-02: Automatic APPLYING
    def test_test02_automatic_applying_refuses_mutation_and_preserves_journal(self):
        self.cluster.own('vps3', phase='APPLYING')
        with self.assertRaisesRegex(RuntimeError, 'RECOVERY_REQUIRED'):
            self.reconcile(automatic=True)
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')
        self.assertEqual(self.c.journal['status'], 'RECOVERY_REQUIRED')
        self.assertEqual(self.cluster.states['vps3']['pending']['phase'], 'APPLYING')

    # TEST-03: Automatic RESTORED
    def test_test03_automatic_restored_refuses_silent_cleanup(self):
        self.cluster.own('vps3', phase='RESTORED')
        with self.assertRaisesRegex(RuntimeError, 'RECOVERY_REQUIRED'):
            self.reconcile(automatic=True)
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')
        self.assertEqual(self.c.journal['status'], 'RECOVERY_REQUIRED')
        self.assertEqual(self.cluster.states['vps3']['pending']['phase'], 'RESTORED')

    # TEST-04: Partial commit
    def test_test04_automatic_partial_commit_stops_safely(self):
        self.cluster.own('vps3', phase='COMMITTED')
        self.cluster.own('vps2', phase='VERIFIED')
        with self.assertRaisesRegex(RuntimeError, 'RECOVERY_REQUIRED'):
            self.reconcile(automatic=True)
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3', 'vps2')
        self.assertEqual(self.c.journal['status'], 'RECOVERY_REQUIRED')

    # TEST-05: Manual recovery
    def test_test05_manual_recovery_for_compatible_touched_transaction_succeeds(self):
        self.cluster.own('vps3', phase='APPLYING')
        self.reconcile(automatic=False)
        self.assertEqual(len(self.cluster.actions('restore')), 1)
        self.assertEqual(len(self.cluster.actions('verify')), 3)
        self.assertEqual(len(self.cluster.actions('finish')), 1)
        self.assertIsNone(self.cluster.states['vps3']['pending'])
        self.assertEqual(self.c.journal['status'], 'FAILED_ROLLBACK_SUCCESS')

    # TEST-06: Migration incompatibility
    def test_test06_migration_incompatibility_refused_for_both_auto_and_manual(self):
        self.cluster.own('vps3', phase='APPLYING')
        self.cluster.states['vps3']['manifests'][INCIDENT_A]['migration_hash'] = 'incompatible-migration-hash'
        for automatic in (True, False):
            with self.subTest(automatic=automatic), self.assertRaisesRegex(RuntimeError, 'migration compatibility'):
                self.reconcile(automatic=automatic)
            self.assertEqual(self.cluster.calls, [])
            self.assert_locked('vps3')

    # TEST-07: Foreign owner
    def test_test07_automatic_preflight_refuses_foreign_owner_mutation(self):
        self.cluster.own('vps3', INCIDENT_B, phase='APPLYING')
        self.cluster.own('vps2', INCIDENT_A, phase='APPLYING')
        with self.assertRaisesRegex(RuntimeError, 'MANUAL_INTERVENTION_REQUIRED|RECOVERY_REQUIRED'):
            self.reconcile(expected=(INCIDENT_B, INCIDENT_B), automatic=True)
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3', 'vps2')

    # TEST-08: Repeat execution
    def test_test08_repeated_automatic_preflight_and_manual_recovery_idempotent(self):
        self.cluster.own('vps3', phase='APPLYING')
        # Repeated automatic preflight stops safely every time
        for _ in range(2):
            with self.assertRaisesRegex(RuntimeError, 'RECOVERY_REQUIRED'):
                self.reconcile(automatic=True)
            self.assertEqual(self.cluster.calls, [])
            self.assert_locked('vps3')
        # Manual recovery then succeeds
        self.reconcile(automatic=False)
        self.assertIsNone(self.cluster.states['vps3']['pending'])
        # Running recovery again on clean cluster is a safe no-op
        calls_count = len(self.cluster.calls)
        self.reconcile(automatic=False)
        self.assertEqual(len(self.cluster.calls), calls_count)
        self.assertEqual(self.c.journal['status'], 'RECOVERY_NOT_NEEDED')

    # TEST-09: New deployment prevention
    def test_test09_unsafe_journal_prevents_new_release_staging_and_begin(self):
        self.cluster.own('vps3', INCIDENT_A, phase='APPLYING')
        with self.assertRaisesRegex(RuntimeError, 'RECOVERY_REQUIRED'):
            self.c.execute()
        self.assertEqual(self.cluster.calls, [])
        self.c.bundle.assert_not_called()
        self.c.ssh_run.assert_not_called()
        self.assertFalse(self.cluster.actions('begin'))
        self.assertFalse(self.cluster.actions('apply'))
        self.assert_locked('vps3')

    # TEST-10: Legacy journals
    def test_test10_legacy_journals_safety_boundary(self):
        # Untouched legacy snapshot -> safe for automatic preflight
        legacy_untouched = {'transaction': INCIDENT_A, 'target': INCIDENT_A,
                            'previous': {'release_id': OLD}, 'touched': False}
        self.cluster.states['vps3']['pending'] = legacy_untouched
        self.cluster.states['vps3']['manifests'][INCIDENT_A] = manifest(INCIDENT_A)
        self.reconcile(automatic=True)
        self.assertFalse(self.cluster.actions('restore'))
        self.assertEqual(len(self.cluster.actions('finish')), 1)
        self.assertIsNone(self.cluster.states['vps3']['pending'])

        # Touched legacy journal -> automatic preflight refuses it without mutating
        self.cluster.calls.clear()
        legacy_touched = {'transaction': INCIDENT_B, 'target': INCIDENT_B,
                          'previous': {'release_id': OLD}, 'touched': True}
        self.cluster.states['vps3']['pending'] = legacy_touched
        self.cluster.states['vps3']['manifests'][INCIDENT_B] = manifest(INCIDENT_B)
        with self.assertRaisesRegex(RuntimeError, 'RECOVERY_REQUIRED'):
            self.reconcile(automatic=True)
        self.assertEqual(self.cluster.calls, [])
        self.assert_locked('vps3')


if __name__ == '__main__':
    unittest.main()
