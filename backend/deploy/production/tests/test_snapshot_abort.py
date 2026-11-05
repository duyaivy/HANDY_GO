"""Manual cancellation of untouched transactions without accepting legacy releases."""
import copy
import datetime
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
import test_host_recovery as host_fixtures
host, OLD, TARGET = host_fixtures.host, host_fixtures.OLD, host_fixtures.TARGET
from test_recovery import Cluster, INCIDENT_A, INCIDENT_B
import recovery
import tempfile


def observation():
    return {'release_id': OLD, 'release_accepted': False,
            'captured_at': (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=30)).isoformat(),
            'containers': {'wallet-service': {'id': 'a' * 64, 'image': 'image-id', 'restart_count': 3,
                'created': '2026-11-03T00:00:00Z', 'started_at': '2026-11-04T08:13:11Z',
                'running': True, 'health': 'healthy', 'oom_killed': False}}}


class HostSnapshotAbortTests(unittest.TestCase):
    setUp = host_fixtures.HostRecoveryTests.setUp
    pending = host_fixtures.HostRecoveryTests.pending

    def prepare_abort(self):
        host.write(self.root / 'fence.json', '1:' + 'a' * 32)
        self.executor.snapshot_abort_baseline(TARGET)
        self.executor.authorize_snapshot_abort(TARGET)

    def test_receipt_before_unlock_preserves_stable_and_does_not_accept_release(self):
        before = (self.root / 'stable.json').read_bytes()
        with patch.object(host.Host, 'observe_runtime', return_value=observation()), patch.object(host, 'run') as run:
            self.prepare_abort()
            result = self.executor.abort_snapshot(TARGET)
        self.assertEqual(result, {'aborted': True, 'release_accepted': False})
        self.assertFalse((self.root / 'pending.json').exists())
        self.assertEqual((self.root / 'stable.json').read_bytes(), before)
        receipt = host.read(self.root / 'transactions' / (TARGET + '.json'))
        self.assertEqual(receipt['unlock'], 'ABORTED_UNTOUCHED_SNAPSHOT')
        self.assertFalse(receipt['release_accepted'])
        self.assertEqual(receipt['snapshot_abort']['baseline']['containers']['wallet-service']['restart_count'], 3)
        run.assert_not_called()

    def test_touched_or_non_snapshot_states_and_apply_evidence_cannot_be_aborted(self):
        for changes in ({'touched': True}, {'phase': 'APPLYING'}, {'phase': 'RESTORED'},
                        {'container_evidence': {'accepted': {'wallet-service': {}}}},
                        {'container_evidence': {'stop_requested_at': 'time'}}):
            with self.subTest(changes=changes):
                original = host.read(self.root / 'pending.json')
                self.pending(**changes)
                with self.assertRaises(RuntimeError): self.executor.snapshot_abort_baseline(TARGET)
                self.assertTrue((self.root / 'pending.json').exists())
                host.write(self.root / 'pending.json', original)

    def test_changed_counter_identity_or_started_at_preserves_journal(self):
        for change in ({'restart_count': 4}, {'id': 'b' * 64}, {'started_at': 'new-start'}):
            with self.subTest(change=change), patch.object(host.Host, 'observe_runtime', return_value=observation()) as observe:
                self.prepare_abort()
                changed = observation()
                changed['containers']['wallet-service'].update(change)
                observe.return_value = changed
                with self.assertRaisesRegex(RuntimeError, 'changed/restarted'): self.executor.abort_snapshot(TARGET)
                self.assertTrue((self.root / 'pending.json').exists())

    def test_missing_authorization_changed_fence_and_stale_baseline_are_rejected(self):
        with self.assertRaises(RuntimeError): self.executor.abort_snapshot(TARGET)
        with patch.object(host.Host, 'observe_runtime', return_value=observation()):
            self.prepare_abort()
            host.write(self.root / 'fence.json', '2:' + 'b' * 32)
            with self.assertRaisesRegex(RuntimeError, 'fenced'): self.executor.abort_snapshot(TARGET)
            self.prepare_abort()
            state = host.read(self.root / 'pending.json')
            for seconds in (0, 601):
                state['snapshot_abort']['baseline']['captured_at'] = (
                    datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=seconds)).isoformat()
                host.write(self.root / 'pending.json', state)
                with self.assertRaisesRegex(RuntimeError, 'fresh runtime'): self.executor.abort_snapshot(TARGET)

    def test_crash_after_receipt_before_unlink_can_be_retried(self):
        with patch.object(host.Host, 'observe_runtime', return_value=observation()):
            self.prepare_abort()
            with patch.object(Path, 'unlink', side_effect=RuntimeError('crash before unlink')):
                with self.assertRaisesRegex(RuntimeError, 'crash'): self.executor.abort_snapshot(TARGET)
            receipt = (self.root / 'transactions' / (TARGET + '.json')).read_bytes()
            self.assertTrue((self.root / 'pending.json').exists())
            self.executor.abort_snapshot(TARGET)
            self.assertEqual((self.root / 'transactions' / (TARGET + '.json')).read_bytes(), receipt)

    def test_runtime_observation_rejects_bad_image_health_and_does_not_verify_restart_history(self):
        old = host.Host('vps3', OLD)
        old.manifest['services'] = {'wallet-service': {'scope': 'health-only'}}
        snapshot = observation()['containers']['wallet-service']
        with patch.object(old, '_container_snapshot', return_value=snapshot), patch.object(host, 'run', return_value='image-id'):
            self.assertFalse(old.observe_runtime()['release_accepted'])
            for change in ({'health': 'unhealthy'}, {'image': 'wrong'}, {'running': False}, {'oom_killed': True}):
                with patch.object(old, '_container_snapshot', return_value=snapshot | change), self.assertRaises(RuntimeError):
                    old.observe_runtime()

    def test_restart_during_successful_business_probe_is_rejected(self):
        old = host.Host('vps3', OLD)
        old.manifest['services'] = {'wallet-service': {'scope': 'business'}}
        snapshot = observation()['containers']['wallet-service']
        with patch.object(old, '_container_snapshot', side_effect=[snapshot, snapshot | {'restart_count': 4}]), \
                patch.object(host, 'run', return_value='image-id'), self.assertRaisesRegex(RuntimeError, 'business probe'):
            old.observe_runtime()

    def test_final_probe_exceeding_freshness_and_receipt_write_failure_keep_pending(self):
        value = observation()
        real_datetime = datetime.datetime
        started = real_datetime.fromisoformat(value['captured_at'])
        with patch.object(host.Host, 'observe_runtime', return_value=value):
            self.prepare_abort()
            with patch.object(host.datetime, 'datetime') as clock:
                clock.fromisoformat = real_datetime.fromisoformat
                clock.now.side_effect = [started + datetime.timedelta(seconds=30), started + datetime.timedelta(seconds=601)]
                with self.assertRaisesRegex(RuntimeError, 'expired'): self.executor.abort_snapshot(TARGET)
            self.assertTrue((self.root / 'pending.json').exists())
            with patch.object(host, 'write', side_effect=RuntimeError('receipt disk full')):
                with self.assertRaisesRegex(RuntimeError, 'disk full'): self.executor.abort_snapshot(TARGET)
            self.assertTrue((self.root / 'pending.json').exists())


class AbortCluster(Cluster):
    def __init__(self, directory):
        super().__init__(directory)
        self.observed = {role: observation() for role in self.states}

    def remote(self, role, action, target=None, wait_lock=False):
        if action == 'observe-runtime':
            self.calls.append((role, action, target, self.c.transaction))
            if (role, action) in self.before: self.before[(role, action)]()
            if (role, action) in self.fail: raise self.fail[(role, action)]
            return copy.deepcopy(self.observed[role])
        result = super().remote(role, action, target, wait_lock)
        if action == 'abort-snapshot':
            self.states[role]['pending'] = None
            return {'aborted': True, 'release_accepted': False}
        return result


class ClusterSnapshotAbortTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.cluster = AbortCluster(Path(temp.name) / 'output')
        self.c = self.cluster.c
        self.cluster.own('vps3')
        sleep = patch.object(recovery.time, 'sleep')
        self.sleep = sleep.start()
        self.addCleanup(sleep.stop)

    def abort(self, **kwargs):
        return recovery.reconcile(self.c, expected=(INCIDENT_A, INCIDENT_A), abort_untouched=True, **kwargs)

    def test_explicit_abort_observes_twice_without_restore_verify_commit_or_normal_finish(self):
        self.abort()
        self.assertEqual(len(self.cluster.actions('observe-runtime')), 6)
        self.sleep.assert_called_once_with(20)
        for action in ('restore', 'verify', 'commit', 'finish', 'authorize-finish', 'apply'):
            self.assertFalse(self.cluster.actions(action))
        self.assertIsNone(self.cluster.states['vps3']['pending'])
        self.assertEqual(self.c.journal['status'], 'SNAPSHOT_ABORTED_PREVIOUS_NOT_VERIFIED')
        self.assertTrue(all(s['stable'] == {'release_id': OLD} for s in self.cluster.states.values()))

    def test_manual_only_wrong_owner_and_touched_or_mixed_transactions_remain_locked(self):
        for option in ('automatic', 'inspect_only', 'env_only'):
            with self.subTest(option=option), self.assertRaises(RuntimeError): self.abort(**{option: True})
        with self.assertRaises(RuntimeError):
            recovery.reconcile(self.c, expected=(INCIDENT_B, INCIDENT_B), abort_untouched=True)
        self.cluster.own('vps2', transaction=INCIDENT_B)
        with self.assertRaises(RuntimeError): self.abort()
        self.cluster.states['vps2']['pending'] = None
        self.cluster.own('vps3', phase='APPLYING')
        with self.assertRaises(RuntimeError): self.abort()
        self.assertFalse(self.cluster.actions('abort-snapshot'))

    def test_restart_on_unowned_host_or_failed_smoke_prevents_authorization(self):
        self.sleep.side_effect = lambda _: self.cluster.observed['vps2']['containers']['wallet-service'].update(restart_count=4)
        with self.assertRaisesRegex(RuntimeError, 'runtime changed'): self.abort()
        self.assertFalse(self.cluster.actions('authorize-snapshot-abort'))
        self.sleep.side_effect = None
        self.c.public_smoke.side_effect = RuntimeError('HTTPS failure')
        with self.assertRaisesRegex(RuntimeError, 'HTTPS'): self.abort()
        self.assertFalse(self.cluster.actions('abort-snapshot'))

    def test_phase_changes_during_observation_are_not_unlocked(self):
        self.sleep.side_effect = lambda _: self.cluster.states['vps3']['pending'].update(phase='APPLYING', touched=True)
        with self.assertRaisesRegex(RuntimeError, 'state changed'): self.abort()
        self.assertFalse(self.cluster.actions('authorize-snapshot-abort'))

    def test_partial_cleanup_retry_only_aborts_remaining_owner(self):
        self.cluster.own('vps2')
        self.cluster.fail['vps2', 'abort-snapshot'] = RuntimeError('SSH lost')
        with self.assertRaisesRegex(RuntimeError, 'SSH lost'): self.abort()
        self.assertIsNone(self.cluster.states['vps3']['pending'])
        self.assertIsNotNone(self.cluster.states['vps2']['pending'])
        self.cluster.fail.clear()
        self.abort()
        self.assertIsNone(self.cluster.states['vps2']['pending'])
        self.abort()  # terminal retry performs no runtime operation or release acceptance
        self.assertEqual(self.c.journal['status'], 'RECOVERY_NOT_NEEDED')

    def test_migration_hash_difference_is_only_tolerated_while_untouched(self):
        self.cluster.states['vps3']['manifests'][INCIDENT_A]['migration_hash'] = 'different'
        self.abort()
        self.assertFalse(self.cluster.actions('restore'))
        self.cluster.own('vps3', phase='APPLYING')
        self.cluster.states['vps3']['manifests'][INCIDENT_A]['migration_hash'] = 'different'
        with self.assertRaisesRegex(RuntimeError, 'migration compatibility'): self.abort()

    def test_workflow_requires_separate_confirmation_and_original_run_identity(self):
        workflow = (PROD.parents[2] / '.github/workflows/backend-production-recovery.yml').read_text()
        self.assertIn('options: [inspect, recover, abort-untouched]', workflow)
        self.assertIn('"$CONFIRM" == ABORT_UNTOUCHED_SNAPSHOT', workflow)
        self.assertIn('args+=(--abort-untouched)', workflow)
        self.assertIn("run.get('head_branch') == 'release'", workflow)
