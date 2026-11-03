"""ENV refresh invariants and recovery after the coordinating runner disappears."""
import argparse
import io
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
import host
import orchestrate
import refresh_env

RELEASE = 'prod-20261030-101-a1'
OLD = 'prod-20261029-100-a1'


class EnvRefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = self.root / 'candidate.env'
        self.env.write_text((PROD / 'env/production.env.example').read_text().replace(
            'REPLACE_', 'fixture-at-least-thirty-two-characters-'))
        self.files = {name: (PROD / name).read_bytes() for name in refresh_env.FILES}
        self.old = {
            'schema_version': 1, 'release_id': OLD, 'rollback_compatible': True,
            'run_migrations': True, 'migration_hash': 'existing-migrations', 'domain': 'api.example.com',
            'app_image': 'ghcr.io/example/backend@sha256:' + 'a' * 64,
            'migration_image': 'ghcr.io/example/backend@sha256:' + 'b' * 64,
            'nginx_image': 'nginx@sha256:' + 'c' * 64,
            'hosts': {'vps1': ['auth-service', 'nginx'], 'vps2': ['order-service'], 'vps3': ['catalog-service']},
            'images': {'auth-service': 'same-deployed-digest'},
            'files': {name: orchestrate.digest(content) for name, content in self.files.items()},
        }

    def coordinator(self):
        obj = refresh_env.EnvRefreshCoordinator.__new__(refresh_env.EnvRefreshCoordinator)
        obj.args = argparse.Namespace(env_file=str(self.env), run_id=101, attempt=1,
                                      rollout_timeout_minutes=30, rollback_release='', run_migrations=False)
        obj.target = obj.transaction = RELEASE
        obj.output = self.root / 'output'
        obj.journal = {'transaction': RELEASE, 'target_release': RELEASE,
                       'status': 'PREPARING', 'hosts': {}, 'rollback': {}}
        obj.public_smoke = Mock()
        def ssh(role, command, **kwargs):
            path = shlex.split(command)[-1]
            if path.endswith('/stable.json'):
                return json.dumps({'release_id': OLD}).encode()
            if path.endswith('/manifest.json'):
                return json.dumps(self.old).encode()
            return self.files[path.removeprefix(f'/opt/handygo/releases/{OLD}/')]
        obj.ssh_run = Mock(side_effect=ssh)
        return obj

    def test_bundle_keeps_deployed_images_and_versions_private_env_without_migrations(self):
        obj = self.coordinator()
        manifest, payload = obj.bundle()
        for key in ('app_image', 'migration_image', 'nginx_image', 'images', 'migration_hash'):
            self.assertEqual(manifest[key], self.old[key])
        self.assertFalse(manifest['run_migrations'])
        self.assertTrue(manifest['env_refresh'])
        self.assertEqual(manifest['env_refresh_from'], OLD)
        with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
            self.assertEqual(archive.extractfile('shared.env').read(), self.env.read_bytes())
            self.assertEqual(archive.getmember('shared.env').mode, 0o600)
            self.assertIn('env-preflight.mjs', archive.getnames())
        self.assertFalse(any('shared.env' in str(c.args) for c in obj.ssh_run.call_args_list))
        self.assertNotIn('fixture-at-least-thirty-two-characters-', (obj.output / 'manifest.json').read_text())

    def test_refresh_of_a_previous_env_refresh_is_supported(self):
        self.old['files']['env-preflight.mjs'] = 'old-probe-checksum'
        self.assertTrue(self.coordinator().bundle()[0]['env_refresh'])

    def test_tampered_deployed_configuration_and_invalid_env_are_rejected(self):
        self.old['files']['services.json'] = '0' * 64
        with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
            self.coordinator().bundle()
        self.old['files']['services.json'] = orchestrate.digest(self.files['services.json'])
        self.env.write_text('NODE_ENV=production\n')
        with self.assertRaises(ValueError):
            self.coordinator().bundle()

    def test_prepare_uses_cached_image_without_pulling_or_mutating_live_services(self):
        obj = host.Host.__new__(host.Host)
        obj.role, obj.release_id, obj.names = 'vps2', RELEASE, ['order-service']
        obj.metadata = {'private_ip': '10.77.0.2'}
        obj.manifest = {**self.old, 'env_refresh': True, 'run_migrations': False}
        obj.owner, obj.validate_bundle, obj.compose = Mock(), Mock(), Mock()
        obj.check_memory, obj.check_env_dependencies = Mock(return_value={}), Mock()
        with patch.object(host, 'run', side_effect=['2.30.0', 'inet 10.77.0.2/24', 'x86_64', 'cached']) as run, \
                patch.object(host.shutil, 'disk_usage', return_value=Mock(free=3 * 1024 ** 3)):
            self.assertTrue(obj.prepare(RELEASE)['prepared'])
        self.assertEqual(run.call_args.args[0], ['docker', 'image', 'inspect', self.old['app_image']])
        obj.compose.assert_called_once_with('config', '--quiet')
        obj.check_env_dependencies.assert_called_once()

    def test_dependency_failure_aborts_prepare_before_any_live_restart(self):
        obj = host.Host.__new__(host.Host)
        obj.role, obj.release_id, obj.names = 'vps2', RELEASE, ['order-service']
        obj.metadata = {'private_ip': '10.77.0.2'}
        obj.manifest = {**self.old, 'env_refresh': True, 'run_migrations': False}
        obj.owner, obj.validate_bundle, obj.compose = Mock(), Mock(), Mock()
        obj.check_memory = Mock(return_value={})
        obj.check_env_dependencies = Mock(side_effect=RuntimeError('candidate rejected'))
        with patch.object(host, 'run', side_effect=['2.30.0', 'inet 10.77.0.2/24', 'x86_64', 'cached']), \
                patch.object(host.shutil, 'disk_usage', return_value=Mock(free=3 * 1024 ** 3)):
            with self.assertRaisesRegex(RuntimeError, 'candidate rejected'):
                obj.prepare(RELEASE)
        obj.compose.assert_called_once_with('config', '--quiet')

    def test_apply_forces_recreation_and_never_pulls_or_runs_migrations(self):
        obj = host.Host.__new__(host.Host)
        obj.role, obj.release_id, obj.names = 'vps1', RELEASE, ['auth-service', 'nginx']
        obj.manifest = {'env_refresh': True, 'run_migrations': False}
        obj.owner = Mock(return_value={'previous': None})
        obj.compose, obj.verify = Mock(), Mock()
        with patch.object(host, 'ROOT', self.root), patch.object(host, 'run') as run:
            obj.apply(RELEASE)
        run.assert_not_called()
        for call in obj.compose.call_args_list:
            self.assertIn('--force-recreate', call.args)
            self.assertEqual(call.args[call.args.index('--pull') + 1], 'never')

    def test_restore_uses_previous_env_and_local_image_cache(self):
        obj = host.Host.__new__(host.Host)
        obj.role = 'vps1'
        obj.names, obj.manifest = ['auth-service'], {'env_refresh': True}
        obj.owner = Mock(return_value={'touched': True, 'previous': {'release_id': OLD}})
        old = Mock(names=['auth-service'], release_id=OLD)
        with patch.object(host, 'ROOT', self.root), patch.object(host, 'Host', return_value=old):
            result = obj.restore(RELEASE)
        self.assertEqual(result['rollback'], 'RESTORED')
        self.assertEqual(old.compose.call_args.args[old.compose.call_args.args.index('--pull') + 1], 'never')

    def recovery(self, pending=True):
        obj = self.coordinator()
        manifest = {**self.old, 'release_id': RELEASE, 'env_refresh': True, 'run_id': 101, 'run_attempt': 1}
        states = {role: {'stable': {'release_id': OLD}, 'pending': {
            'transaction': RELEASE, 'target': RELEASE, 'previous': {'release_id': OLD},
            'touched': True, 'phase': 'APPLYING',
        } if pending else None} for role in orchestrate.ROLES}
        def ssh(role, command, **kwargs):
            if shlex.split(command)[1] == '-c':
                return json.dumps(states[role]).encode()
            return json.dumps(self.old if f'/{OLD}/' in command else manifest).encode()
        obj.ssh_run = Mock(side_effect=ssh)
        def remote(role, action, target=None, **kwargs):
            if action == 'restore':
                states[role]['stable'] = {'release_id': OLD}
                states[role]['pending']['phase'] = 'RESTORED'
                return {'rollback': 'RESTORED', 'release_id': OLD}
            if action == 'finish':
                states[role]['pending'] = None
            return {}
        obj.remote = Mock(side_effect=remote)
        return obj, states, manifest

    def test_recovery_restores_all_hosts_verifies_then_unlocks(self):
        obj, states, _ = self.recovery()
        obj.recover()
        self.assertEqual(obj.journal['status'], 'FAILED_ROLLBACK_SUCCESS')
        calls = obj.remote.call_args_list
        self.assertEqual(sum(c.args[1] == 'restore' for c in calls), 3)
        self.assertEqual(sum(c.args[1:] == ('verify', OLD) for c in calls), 3)
        self.assertGreater(next(i for i, c in enumerate(calls) if c.args[1] == 'finish'),
                           max(i for i, c in enumerate(calls) if c.args[1] == 'verify'))
        self.assertTrue(all(s['pending'] is None for s in states.values()))
        obj.public_smoke.assert_called_once_with(self.old)

    def test_recovery_of_fully_committed_release_only_verifies_and_finishes(self):
        obj, states, _ = self.recovery()
        for state in states.values():
            state['stable'] = {'release_id': RELEASE}
            state['pending']['phase'] = 'COMMITTED'
        states['vps1']['pending'] = None  # Original runner died halfway through unlock.
        obj.recover()
        self.assertEqual(obj.journal['status'], 'STABLE')
        self.assertFalse(any(c.args[1] == 'restore' for c in obj.remote.call_args_list))
        self.assertEqual(sum(c.args[1] == 'verify' for c in obj.remote.call_args_list), 3)
        self.assertEqual(sum(c.args[1] == 'finish' for c in obj.remote.call_args_list), 2)

    def test_recovery_handles_crash_between_stable_write_and_phase_update(self):
        obj, states, _ = self.recovery()
        for state in states.values():
            state['stable'] = {'release_id': RELEASE}
            state['pending']['phase'] = 'VERIFIED'
        obj.recover()
        self.assertEqual(sum(c.args[1] == 'commit' for c in obj.remote.call_args_list), 3)

    def test_partial_commit_is_rolled_back_instead_of_clearing_locks(self):
        obj, states, _ = self.recovery()
        states['vps3']['stable'] = {'release_id': RELEASE}
        states['vps3']['pending']['phase'] = 'COMMITTED'
        obj.recover()
        self.assertEqual(obj.journal['status'], 'FAILED_ROLLBACK_SUCCESS')
        self.assertTrue(all(s['stable']['release_id'] == OLD for s in states.values()))

    def test_foreign_pending_transaction_is_never_modified(self):
        obj, states, _ = self.recovery()
        states['vps2']['pending']['transaction'] = OLD
        with self.assertRaisesRegex(RuntimeError, 'another run'):
            obj.recover()
        obj.remote.assert_not_called()
        self.assertEqual(obj.journal['status'], 'FAILED_NEEDS_INTERVENTION')

    def test_manifest_mismatch_and_non_env_release_are_rejected_before_mutation(self):
        obj, _, manifest = self.recovery()
        manifest['env_refresh'] = False
        with self.assertRaisesRegex(RuntimeError, 'ENV-only manifests'):
            obj.recover()
        obj.remote.assert_not_called()

    def test_unreachable_host_or_failed_verification_never_unlocks(self):
        for failure in ('SSH', 'verify'):
            with self.subTest(failure=failure):
                obj, _, _ = self.recovery()
                if failure == 'SSH':
                    obj.ssh_run.side_effect = RuntimeError('unreachable')
                else:
                    remote = obj.remote.side_effect
                    def fail_verify(role, action, *args, **kwargs):
                        if action == 'verify':
                            raise RuntimeError('not healthy')
                        return remote(role, action, *args, **kwargs)
                    obj.remote.side_effect = fail_verify
                with self.assertRaises(RuntimeError):
                    obj.recover()
                self.assertFalse(any(c.args[1] == 'finish' for c in obj.remote.call_args_list))
                self.assertEqual(obj.journal['status'], 'FAILED_NEEDS_INTERVENTION')

    def test_no_pending_is_a_safe_no_op(self):
        obj, _, _ = self.recovery(pending=False)
        obj.recover()
        obj.remote.assert_not_called()
        self.assertEqual(obj.journal['status'], 'RECOVERY_NOT_NEEDED')

    def test_retry_after_partial_unlock_only_recovers_remaining_owner(self):
        obj, states, _ = self.recovery()
        states['vps3']['pending'] = None
        obj.recover()
        self.assertEqual(sum(c.args[1] == 'restore' for c in obj.remote.call_args_list), 2)
        self.assertEqual(sum(c.args[1] == 'verify' for c in obj.remote.call_args_list), 3)

    def test_rollover_at_midnight_uses_pending_identity_from_original_day(self):
        obj, _, _ = self.recovery()
        obj.transaction = obj.target = 'prod-20261031-101-a1'
        obj.recover()
        self.assertEqual(obj.transaction, RELEASE)

    def test_forward_deadline_blocks_new_ssh_calls(self):
        obj = self.coordinator()
        obj.rollout_deadline = time.monotonic() - 1
        with patch.object(orchestrate.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'reserved job time'):
                orchestrate.Coordinator.ssh_run(obj, 'vps1', 'unused')
        run.assert_not_called()

    def test_recovery_does_not_touch_an_unlocked_host_with_divergent_stable(self):
        obj, states, _ = self.recovery()
        states['vps1'] = {'pending': None, 'stable': {'release_id': RELEASE}}
        with self.assertRaisesRegex(RuntimeError, 'unlocked host'):
            obj.recover()
        obj.remote.assert_not_called()

    def test_recovery_waits_for_existing_host_operation_before_checking_owner(self):
        executor = Mock()
        executor.finish.return_value = {'unlocked': True}
        with patch.object(host, 'ROOT', self.root), \
                patch.object(host.sys, 'argv', ['host.py', 'finish', 'vps1', RELEASE, RELEASE, '--wait-lock']), \
                patch.object(host.fcntl, 'flock', side_effect=[BlockingIOError(), None]) as flock, \
                patch.object(host.time, 'sleep') as sleep, patch.object(host, 'Host', return_value=executor):
            host.main()
        self.assertEqual(flock.call_count, 2)
        sleep.assert_called_once_with(1)
        executor.finish.assert_called_once_with(RELEASE)

    def test_normal_deploy_never_waits_or_steals_an_active_host_operation(self):
        with patch.object(host, 'ROOT', self.root), \
                patch.object(host.sys, 'argv', ['host.py', 'begin', 'vps1', RELEASE, RELEASE]), \
                patch.object(host.fcntl, 'flock', side_effect=BlockingIOError()), \
                patch.object(host, 'Host') as constructor:
            with self.assertRaisesRegex(RuntimeError, 'leave pending.json intact'):
                host.main()
        constructor.assert_not_called()

    def test_node_dependency_preflight_success_and_failure_paths(self):
        result = subprocess.run(['node', '--test', str(PROD / 'tests/env-preflight.test.mjs')],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
