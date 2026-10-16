"""Failure-path tests: multi-host deployments are compensating operations, not atomic."""
import argparse
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import sys
import tarfile
import unittest
from unittest.mock import Mock, patch

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))


def load(name):
    spec = importlib.util.spec_from_file_location(name, PROD / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


host = load('host')
coordinator = load('orchestrate')
release_log = sys.modules['release_log']
RELEASE = 'prod-20261016-100-a1'
OLD = 'prod-20261015-99-a1'


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_env_rejects_duplicate_and_quoted_values(self):
        path = self.root / 'shared.env'
        for text in ('FOO=a\nFOO=b\n', 'FOO="secret"\n', 'FOO=REPLACE_SECRET\n'):
            path.write_text(text)
            with self.assertRaises(ValueError):
                host.validate_env(path)

    def make_coordinator(self, failure=None, unreachable=False, bootstrap=False):
        obj = coordinator.Coordinator.__new__(coordinator.Coordinator)
        obj.args = argparse.Namespace(rollback_release='', run_migrations=False, domain='api.example.com')
        obj.transaction = obj.target = RELEASE
        obj.output = self.root / 'output'
        obj.journal = {'hosts': {}, 'rollback': {}, 'status': 'PREPARING'}
        manifest = {'migration_hash': 'same', 'domain': 'api.example.com'}
        obj.bundle = Mock(return_value=(manifest, b'archive'))
        obj.ssh_run = Mock(return_value=b'')
        obj.public_smoke = Mock()
        calls = []

        def remote(role, action, target=None):
            calls.append((role, action, target))
            if (role, action) == failure:
                raise RuntimeError('Injected failure')
            if action == 'restore' and unreachable and role == 'vps2':
                raise RuntimeError('Unreachable')
            if action == 'begin':
                result = {'previous': None if bootstrap else {'release_id': OLD},
                          'previous_manifest': manifest, 'migration_hash': 'same'}
            elif action == 'restore':
                result = {'rollback': 'NO_PREVIOUS_RELEASE' if bootstrap else 'RESTORED', 'release_id': OLD}
            else:
                result = {}
            obj.journal['hosts'].setdefault(role, {})[action] = result
            return result

        obj.remote = remote
        return obj, calls

    def test_last_host_failure_restores_every_participant(self):
        obj, calls = self.make_coordinator(('vps1', 'apply'))
        with self.assertRaisesRegex(RuntimeError, 'FAILED_ROLLBACK_SUCCESS'):
            obj.execute()
        self.assertEqual({r for r, a, _ in calls if a == 'restore'}, set(coordinator.ROLES))
        self.assertEqual(sum(a == 'verify' and t == OLD for _, a, t in calls), 3)
        self.assertFalse(any(a == 'commit' for _, a, _ in calls))

    def test_unreachable_host_never_reports_rollback_success_or_unlocks(self):
        obj, calls = self.make_coordinator(('vps1', 'apply'), unreachable=True)
        with self.assertRaisesRegex(RuntimeError, 'FAILED_NEEDS_INTERVENTION'):
            obj.execute()
        self.assertEqual(obj.journal['rollback']['vps2'], 'FAILED_OR_UNREACHABLE')
        self.assertFalse(any(a == 'finish' for _, a, _ in calls))

    def test_first_deploy_does_not_invent_previous_release(self):
        obj, calls = self.make_coordinator(('vps1', 'apply'), bootstrap=True)
        with self.assertRaisesRegex(RuntimeError, 'FAILED_NEEDS_INTERVENTION'):
            obj.execute()
        self.assertTrue(all(v == 'NO_PREVIOUS_RELEASE' for v in obj.journal['rollback'].values()))

    def test_uncertain_begin_is_included_in_compensation(self):
        obj, calls = self.make_coordinator(('vps2', 'begin'))
        with self.assertRaises(RuntimeError):
            obj.execute()
        self.assertIn(('vps2', 'restore', None), calls)
        self.assertFalse(any(a == 'apply' for _, a, _ in calls))

    def test_staging_failure_does_not_require_transaction_recovery(self):
        obj, calls = self.make_coordinator()
        obj.ssh_run.side_effect = RuntimeError('vps2: SSH failed')
        with self.assertRaisesRegex(RuntimeError, 'FAILED_BEFORE_ROLLOUT'):
            obj.execute()
        self.assertEqual(obj.journal['status'], 'FAILED_BEFORE_ROLLOUT')
        self.assertEqual(calls, [])

    def test_bundle_ships_logging_helper_without_putting_env_in_artifacts(self):
        obj, _ = self.make_coordinator()
        env_path = self.root / 'shared.env'
        template = (PROD / 'env/production.env.example').read_text()
        env_path.write_text(template.replace('REPLACE_', 'fixture-secret-at-least-thirty-two-characters-')
                           .replace('SMTP_PASS=fixture-secret-at-least-thirty-two-characters-APP_PASSWORD',
                                    'SMTP_PASS=private-smtp-value'))
        evidence_path = self.root / 'evidence.json'
        evidence_path.write_text(json.dumps({'tree_sha': 'b' * 40}))
        obj.args = argparse.Namespace(commit='a' * 40, tree='b' * 40, evidence=str(evidence_path),
                                      domain='handygo.duyaivy.id.vn', env_file=str(env_path),
                                      app_image='ghcr.io/example/backend@sha256:' + 'c' * 64,
                                      migration_image='ghcr.io/example/backend@sha256:' + 'd' * 64,
                                      nginx_image='nginx@sha256:' + 'e' * 64,
                                      run_id=100, attempt=1, run_migrations=False)
        manifest, data = coordinator.Coordinator.bundle(obj)
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            self.assertIn('release_log.py', archive.getnames())
            self.assertEqual(archive.extractfile('shared.env').read(), env_path.read_bytes())
            nginx = archive.extractfile('nginx/handygo.conf').read().decode()
            self.assertEqual(nginx.count('server_name handygo.duyaivy.id.vn;'), 2)
            self.assertIn('return 301 https://handygo.duyaivy.id.vn$request_uri;', nginx)
            self.assertNotIn('API_DOMAIN', nginx)
        self.assertEqual(manifest['domain'], 'handygo.duyaivy.id.vn')
        self.assertIn('release_log.py', manifest['files'])
        self.assertNotIn('private-smtp-value', (obj.output / 'manifest.json').read_text())

    def test_commit_failure_restores_even_already_committed_hosts(self):
        obj, calls = self.make_coordinator(('vps1', 'commit'))
        with patch.object(coordinator.time, 'sleep'), self.assertRaisesRegex(RuntimeError, 'FAILED_ROLLBACK_SUCCESS'):
            obj.execute()
        self.assertIn(('vps3', 'commit', None), calls)
        self.assertIn(('vps3', 'restore', None), calls)

    def test_unlock_failure_does_not_start_another_rollout(self):
        obj, calls = self.make_coordinator(('vps1', 'finish'))
        with patch.object(coordinator.time, 'sleep'), self.assertRaisesRegex(RuntimeError, 'lock cleanup'):
            obj.execute()
        self.assertEqual(obj.journal['status'], 'STABLE')
        self.assertFalse(any(a == 'restore' for _, a, _ in calls))

    def test_host_cannot_steal_existing_transaction(self):
        obj = host.Host.__new__(host.Host)
        obj.role, obj.release_id = 'vps1', RELEASE
        host.write(self.root / 'pending.json', {'transaction': OLD})
        with patch.object(host, 'ROOT', self.root), self.assertRaisesRegex(RuntimeError, 'Unfinished'):
            obj.begin(RELEASE)

    def test_first_deploy_partial_commit_is_cleared_when_restored(self):
        obj = host.Host.__new__(host.Host)
        obj.release_id, obj.names = RELEASE, ['catalog-service']
        obj.owner = Mock(return_value={'touched': True, 'previous': None, 'phase': 'COMMITTED'})
        obj.compose = Mock()
        host.write(self.root / 'stable.json', {'release_id': RELEASE})
        with patch.object(host, 'ROOT', self.root):
            result = obj.restore(RELEASE)
        self.assertEqual(result['rollback'], 'NO_PREVIOUS_RELEASE')
        self.assertFalse((self.root / 'stable.json').exists())
        self.assertEqual(host.read(self.root / 'pending.json')['phase'], 'BOOTSTRAP_FAILED')

    def test_command_error_is_visible_without_credentials(self):
        path = self.root / 'shared.env'
        path.write_text('DATABASE_URL=postgresql://alice:p%40ssword@db.example/app\nSMTP_PASS=smtp-private\n')
        output = io.StringIO()
        result = Mock(returncode=1, stdout='', stderr='Cannot connect postgresql://alice:p%40ssword@db.example/app p@ssword smtp-private')
        with patch.object(release_log, 'SECRETS', set()):
            release_log.load_secrets(path)
            with patch.object(host.subprocess, 'run', return_value=result), contextlib.redirect_stderr(output):
                with self.assertRaisesRegex(RuntimeError, 'exit 1'):
                    host.run(['docker', 'compose'], label='vps1 compose up auth-service')
        logs = output.getvalue()
        self.assertIn('Cannot connect', logs)
        self.assertIn('vps1 compose up auth-service', logs)
        for secret in ('alice', 'p%40ssword', 'p@ssword', 'smtp-private', 'db.example'):
            self.assertNotIn(secret, logs)

    def test_remote_output_cannot_inject_actions_commands(self):
        output = io.StringIO()
        with contextlib.redirect_stderr(output):
            release_log.emit('vps1', '\x1b[31mfailed\n::add-mask::hidden')
        self.assertIn('[vps1] failed', output.getvalue())
        self.assertNotIn('::add-mask::', output.getvalue())
        self.assertNotIn('\x1b', output.getvalue())

    def test_ssh_keeps_json_stdout_and_streams_stderr(self):
        obj = coordinator.Coordinator.__new__(coordinator.Coordinator)
        obj.ssh = ['ssh']
        obj.targets = {role: f'deploy@{role}.example.com' for role in coordinator.ROLES}
        obj.identities = {role: f'/tmp/handygo_{role}' for role in coordinator.ROLES}
        result = Mock(returncode=0, stdout=b'{"prepared": true}')
        for role in coordinator.ROLES:
            with self.subTest(role=role), patch.object(coordinator.subprocess, 'run', return_value=result) as run:
                self.assertEqual(obj.ssh_run(role, 'remote', label='prepare'), result.stdout)
            self.assertEqual(run.call_args.kwargs['stdout'], coordinator.subprocess.PIPE)
            self.assertNotIn('stderr', run.call_args.kwargs)
            self.assertEqual(run.call_args.args[0], ['ssh', '-i', f'/tmp/handygo_{role}', obj.targets[role], 'remote'])

    def test_missing_role_key_blocks_before_ssh(self):
        args = argparse.Namespace(run_id=100, attempt=1, rollback_release='', env_file=None,
                                  output=str(self.root / 'output'))
        env = {'DEPLOY_USER': 'deploy', **{role.upper() + '_HOST': f'{role}.example.com' for role in coordinator.ROLES}}
        with patch.dict(coordinator.os.environ, env), patch.object(coordinator.Path, 'home', return_value=self.root), \
                patch.object(coordinator.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'VPS3_SSH_KEY'):
                coordinator.Coordinator(args)
        run.assert_not_called()

    def test_rollback_never_executes_migrations_from_old_manifest(self):
        obj = host.Host.__new__(host.Host)
        obj.role, obj.release_id = 'vps1', OLD
        obj.manifest = {'run_migrations': True}
        obj.names = ['auth-service', 'user-trust-service', 'api-gateway', 'nginx']
        obj.owner = Mock(return_value={'previous': None})
        obj.compose, obj.verify = Mock(), Mock()
        with patch.object(host, 'ROOT', self.root), patch.object(host, 'run') as run:
            obj.apply(RELEASE)
        run.assert_not_called()
        starts = [c.args[-1] for c in obj.compose.call_args_list]
        self.assertLess(starts.index('user-trust-service'), starts.index('auth-service'))
        self.assertLess(starts.index('auth-service'), starts.index('api-gateway'))

    def test_host_only_unlocks_terminal_or_untouched_state(self):
        obj = host.Host.__new__(host.Host)
        obj.owner = Mock(return_value={'phase': 'APPLYING'})
        with self.assertRaisesRegex(RuntimeError, 'not safe'):
            obj.finish(RELEASE)

    def test_preflight_rejects_old_compose_and_wrong_wireguard_address(self):
        obj = host.Host.__new__(host.Host)
        obj.owner, obj.validate_bundle = Mock(), Mock()
        obj.metadata = {'private_ip': '10.77.0.1'}
        for replies, message in ((['2.29.0'], 'Compose >= 2.30'),
                                 (['v2.30.0', '7: wg0 inet 10.77.0.10/24 scope global wg0'], 'WireGuard IP')):
            with self.subTest(replies=replies), patch.object(host, 'run', side_effect=replies):
                with self.assertRaisesRegex(RuntimeError, message):
                    obj.prepare(RELEASE)

    def test_bundle_tampering_is_rejected_before_any_docker_command(self):
        import hashlib
        shared = self.root / 'shared.env'
        shared.write_text('original')
        obj = host.Host.__new__(host.Host)
        obj.bundle = self.root
        obj.manifest = {'config_sha256': hashlib.sha256(b'original').hexdigest(),
                        'files': {'compose.production.yml': hashlib.sha256(b'approved').hexdigest()}}
        (self.root / 'compose.production.yml').write_text('tampered')
        with patch.object(host, 'validate_env'), self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            obj.validate_bundle()


if __name__ == '__main__':
    unittest.main()
