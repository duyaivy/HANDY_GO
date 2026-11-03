"""Host recovery safety using real durable journals and mocked container commands."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
import host

OLD = 'prod-20261030-41006406106-a1'
TARGET = 'prod-20261103-41666137769-a1'
OTHER = 'prod-20261103-41674776379-a1'


class HostRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.patch = patch.object(host, 'ROOT', self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        host.write(self.root / 'host.json', {'role': 'vps3', 'private_ip': '10.77.0.3'})
        for release in (OLD, TARGET):
            bundle = self.root / 'releases' / release
            bundle.mkdir(parents=True)
            env = (PROD / 'env/production.env.example').read_text().replace('REPLACE_', 'fixture-long-enough-private-credential-')
            (bundle / 'shared.env').write_text(env)
            (bundle / 'shared.env').chmod(0o600)
            (bundle / 'compose.production.yml').write_text('services: {}\n')
            manifest = {
                'schema_version': 1, 'release_id': release,
                'hosts': {'vps3': ['wallet-service']}, 'migration_hash': 'same',
                'rollback_compatible': True, 'run_migrations': False,
                'app_image': 'ghcr.io/example/backend@sha256:' + 'a' * 64,
                'migration_image': 'ghcr.io/example/migrate@sha256:' + 'b' * 64,
                'nginx_image': 'nginx@sha256:' + 'c' * 64,
                'config_sha256': hashlib.sha256(env.encode()).hexdigest(),
                'files': {'compose.production.yml': hashlib.sha256(b'services: {}\n').hexdigest()},
            }
            host.write(bundle / 'manifest.json', manifest)
        host.write(self.root / 'stable.json', {'release_id': OLD})
        self.executor = host.Host('vps3', TARGET)
        self.executor.begin(TARGET)

    def pending(self, **changes):
        state = host.read(self.root / 'pending.json')
        state.update(changes)
        host.write(self.root / 'pending.json', state)
        return state

    def test_inspect_is_read_only_and_does_not_expose_env(self):
        before = {p: (p.stat().st_mtime_ns, p.stat().st_mode, p.read_bytes())
                  for p in self.root.rglob('*') if p.is_file()}
        state = host.inspect_state('vps3')
        self.assertEqual(state['pending']['transaction'], TARGET)
        self.assertEqual(set(state['manifests']), {OLD, TARGET})
        self.assertNotIn('fixture-long-enough-private-credential-', json.dumps(state))
        self.assertEqual(before, {p: (p.stat().st_mtime_ns, p.stat().st_mode, p.read_bytes()) for p in before})

    def test_safe_snapshot_finish_writes_private_receipt(self):
        with patch.object(host.Host, 'compose') as compose:
            self.assertTrue(self.executor.finish(TARGET)['unlocked'])
        compose.assert_not_called()
        receipt = self.root / 'transactions' / (TARGET + '.json')
        self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
        self.assertEqual(host.read(receipt)['unlock'], 'VERIFIED_FINISH')
        self.assertIsNone(host.read(self.root / 'pending.json'))

    def test_snapshot_with_touched_flag_is_never_unlocked(self):
        self.pending(touched=True)
        with self.assertRaises(RuntimeError):
            host.inspect_state('vps3')
        with self.assertRaises(RuntimeError):
            self.executor.finish(TARGET)
        self.assertTrue((self.root / 'pending.json').exists())

    def test_owner_and_target_mismatch_preserve_pending(self):
        before = (self.root / 'pending.json').read_bytes()
        for transaction in (OLD, OTHER):
            with self.assertRaisesRegex(RuntimeError, 'No matching'):
                self.executor.restore(transaction)
        self.executor.release_id = OLD
        with self.assertRaisesRegex(RuntimeError, 'No matching'):
            self.executor.finish(TARGET)
        self.assertEqual(before, (self.root / 'pending.json').read_bytes())

    def test_migration_mismatch_blocks_restore_before_docker(self):
        self.pending(touched=True, phase='APPLYING')
        self.executor.manifest['migration_hash'] = 'new-migrations'
        with patch.object(host.Host, 'compose') as compose, self.assertRaisesRegex(RuntimeError, 'migration compatibility'):
            self.executor.restore(TARGET)
        compose.assert_not_called()
        self.assertEqual(host.read(self.root / 'pending.json')['phase'], 'APPLYING')

    def test_bootstrap_never_stops_containers_or_overwrites_stable(self):
        self.pending(touched=True, phase='BOOTSTRAP_FAILED', previous=None)
        host.write(self.root / 'stable.json', {'release_id': TARGET})
        with patch.object(host.Host, 'compose') as compose, self.assertRaisesRegex(RuntimeError, 'bootstrap'):
            self.executor.restore(TARGET)
        compose.assert_not_called()
        self.assertEqual(host.read(self.root / 'stable.json'), {'release_id': TARGET})
        self.assertTrue((self.root / 'pending.json').exists())

    def test_old_broker_unhealthy_preserves_journal_and_stable(self):
        self.pending(touched=True, phase='APPLYING')
        def compose(*args, **kwargs):
            if args[0] == 'up':
                raise RuntimeError('Wallet unhealthy; old RabbitMQ unreachable')
        with patch.object(host.Host, 'compose', side_effect=compose), self.assertRaisesRegex(RuntimeError, 'Wallet unhealthy'):
            self.executor.restore(TARGET)
        state = host.read(self.root / 'pending.json')
        self.assertEqual(state['phase'], 'APPLYING')
        self.assertEqual(state['recovery_attempt'], 1)
        self.assertEqual(host.read(self.root / 'stable.json'), {'release_id': OLD})
        with self.assertRaises(RuntimeError):
            self.executor.finish(TARGET)

    def test_restored_requires_cluster_authorization_before_unlock(self):
        self.pending(touched=True, phase='APPLYING')
        with patch.object(host.Host, 'compose') as compose:
            self.executor.restore(TARGET)
        calls = [call.args for call in compose.call_args_list if call.args[0] == 'up']
        self.assertTrue(all('--force-recreate' in args for args in calls))
        with self.assertRaisesRegex(RuntimeError, 'Cluster verification'):
            self.executor.finish(TARGET)
        self.executor.authorize_finish(TARGET)
        self.executor.finish(TARGET)
        self.assertFalse((self.root / 'pending.json').exists())

    def test_restore_uses_previous_env_even_when_candidate_secret_changes(self):
        self.pending(touched=True, phase='APPLYING')
        seen = []
        def compose(executor, *args, **kwargs):
            if args[0] == 'up':
                seen.append(executor.env['APP_ENV_FILE'])
        with patch.object(host.Host, 'compose', compose):
            self.executor.restore(TARGET)
        self.assertEqual(seen, [str(self.root / 'releases' / OLD / 'shared.env')])

    def test_stale_cas_refuses_operation_before_constructing_host(self):
        stale = host.state_token()
        self.pending(touched=True, phase='APPLYING')
        arguments = ['host.py', 'restore', 'vps3', TARGET, TARGET, '--expected-state', stale]
        with patch.object(sys, 'argv', arguments), patch.object(host, 'Host') as constructor:
            with self.assertRaisesRegex(RuntimeError, 'changed after inspection'):
                host.main()
        constructor.assert_not_called()

    def test_corrupt_json_reports_no_raw_contents(self):
        (self.root / 'pending.json').write_text('{private-credential-with-invalid-json')
        with self.assertRaises(RuntimeError) as caught:
            host.inspect_state('vps3')
        self.assertNotIn('private-credential', str(caught.exception))

    def test_missing_bundle_is_fail_closed(self):
        (self.root / 'releases' / OLD / 'manifest.json').unlink()
        with self.assertRaises(ValueError):
            host.inspect_state('vps3')
        self.assertTrue((self.root / 'pending.json').exists())

    def test_main_returns_new_fencing_token_after_mutation(self):
        token = host.state_token()
        output = io.StringIO()
        args = ['host.py', 'finish', 'vps3', TARGET, TARGET, '--expected-state', token]
        with patch.object(sys, 'argv', args), contextlib.redirect_stdout(output):
            host.main()
        result = json.loads(output.getvalue())
        self.assertTrue(result['unlocked'])
        self.assertNotEqual(result['_state']['token'], token)
        self.assertIsNone(result['_state']['pending'])

    def test_fence_claim_changes_token_without_changing_snapshots(self):
        token = host.state_token()
        pending = host.read(self.root / 'pending.json')
        args = ['host.py', 'claim-fence', 'vps3', TARGET, TARGET,
                '--expected-state', token, '--fence', '1:' + 'a' * 32]
        with patch.object(sys, 'argv', args), contextlib.redirect_stdout(io.StringIO()):
            host.main()
        self.assertEqual(host.read(self.root / 'pending.json'), pending)
        self.assertEqual(host.read(self.root / 'fence.json'), '1:' + 'a' * 32)
        self.assertNotEqual(host.state_token(), token)

    def test_old_session_cannot_mutate_with_refreshed_state_token(self):
        host.write(self.root / 'fence.json', '2:' + 'b' * 32)
        args = ['host.py', 'finish', 'vps3', TARGET, TARGET,
                '--expected-state', host.state_token(), '--fence', '1:' + 'a' * 32]
        with patch.object(sys, 'argv', args), self.assertRaisesRegex(RuntimeError, 'session fenced'):
            host.main()
        self.assertTrue((self.root / 'pending.json').exists())

    def test_old_epoch_cannot_reclaim_after_reading_newer_session(self):
        newer = '2:' + 'b' * 32
        host.write(self.root / 'fence.json', newer)
        for fence in ('1:' + 'a' * 32, '2:' + 'c' * 32):
            args = ['host.py', 'claim-fence', 'vps3', TARGET, TARGET,
                    '--expected-state', host.state_token(), '--fence', fence]
            with patch.object(sys, 'argv', args), self.assertRaisesRegex(RuntimeError, 'epoch fenced'):
                host.main()
            self.assertEqual(host.read(self.root / 'fence.json'), newer)

    def test_same_epoch_identity_claim_is_idempotent(self):
        fence = '2:' + 'b' * 32
        host.write(self.root / 'fence.json', fence)
        args = ['host.py', 'claim-fence', 'vps3', TARGET, TARGET,
                '--expected-state', host.state_token(), '--fence', fence]
        with patch.object(sys, 'argv', args), contextlib.redirect_stdout(io.StringIO()):
            host.main()
        self.assertEqual(host.read(self.root / 'fence.json'), fence)

    def test_changed_session_breaks_snapshot_aba_token(self):
        (self.root / 'pending.json').unlink()
        host.write(self.root / 'fence.json', '1:' + 'a' * 32)
        before = host.state_token()
        self.executor.begin(TARGET)
        self.executor.finish(TARGET)
        host.write(self.root / 'fence.json', '2:' + 'b' * 32)
        self.assertNotEqual(before, host.state_token())

    def test_restore_records_applying_before_first_container_mutation(self):
        self.pending(touched=True, phase='COMMITTED', verification='CLUSTER_VERIFIED')
        host.write(self.root / 'stable.json', {'release_id': TARGET})
        observed = []
        def compose(*args, **kwargs):
            state = host.read(self.root / 'pending.json')
            observed.append(state['phase'])
            self.assertNotIn('verification', state)
            raise RuntimeError('runner disconnected')
        with patch.object(host.Host, 'compose', side_effect=compose), self.assertRaises(RuntimeError):
            self.executor.restore(TARGET)
        self.assertEqual(observed, ['APPLYING'])
        self.assertEqual(host.read(self.root / 'pending.json')['recovery_from_phase'], 'COMMITTED')

    def test_apply_cannot_replay_after_commit(self):
        self.pending(touched=True, phase='COMMITTED', verification='CLUSTER_VERIFIED')
        with patch.object(host.Host, 'compose') as compose, self.assertRaisesRegex(RuntimeError, 'Cannot apply'):
            self.executor.apply(TARGET)
        compose.assert_not_called()

    def test_legacy_pending_without_phase_is_inspected_as_snapshot_if_untouched(self):
        legacy_state = {'transaction': TARGET, 'target': TARGET, 'previous': {'release_id': OLD}, 'touched': False}
        host.write(self.root / 'pending.json', legacy_state)
        state = host.inspect_state('vps3')
        self.assertEqual(state['pending']['phase'], 'SNAPSHOT')
        self.assertFalse(state['pending']['touched'])

    def test_legacy_pending_without_phase_can_be_finished_safely(self):
        legacy_state = {'transaction': TARGET, 'target': TARGET, 'previous': {'release_id': OLD}, 'touched': False}
        host.write(self.root / 'pending.json', legacy_state)
        with patch.object(host.Host, 'compose') as compose:
            result = self.executor.finish(TARGET)
        self.assertTrue(result['unlocked'])
        self.assertIsNone(host.read(self.root / 'pending.json'))
        compose.assert_not_called()

    def test_legacy_pending_touched_without_phase_can_be_restored_safely(self):
        legacy_state = {'transaction': TARGET, 'target': TARGET, 'previous': {'release_id': OLD}, 'touched': True}
        host.write(self.root / 'pending.json', legacy_state)
        with patch.object(host.Host, 'compose') as compose:
            result = self.executor.restore(TARGET)
        self.assertEqual(result['rollback'], 'RESTORED')
        self.assertEqual(host.read(self.root / 'pending.json')['phase'], 'RESTORED')
        self.assertEqual(host.read(self.root / 'pending.json')['recovery_from_phase'], 'APPLYING')


if __name__ == '__main__':
    unittest.main()
