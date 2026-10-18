"""Nginx prepare checks; opt-in Docker tests use only disposable local fixtures."""
import json
import contextlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
import host

RELEASE = 'prod-20261016-100-a1'


class NginxPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.obj = host.Host.__new__(host.Host)
        self.obj.role, self.obj.release_id = 'vps1', RELEASE
        self.obj.bundle = self.root / 'releases' / RELEASE
        (self.obj.bundle / 'nginx').mkdir(parents=True)
        for filename in ('nginx.conf', 'handygo.conf'):
            path = self.obj.bundle / 'nginx' / filename
            path.write_text('fixture')
            path.chmod(0o600)
        (self.root / 'tls').mkdir(mode=0o750)
        (self.root / 'acme').mkdir()
        for filename in ('fullchain.pem', 'privkey.pem'):
            path = self.root / 'tls' / filename
            path.write_text('fixture')
            path.chmod(0o640)
        self.obj.manifest = {'nginx_image': 'nginx@sha256:' + 'e' * 64, 'run_migrations': False}
        self.service = {
            'user': '101:101', 'image': self.obj.manifest['nginx_image'],
            'volumes': [
                {'type': 'bind', 'source': str(source), 'target': target, 'read_only': True}
                for source, target in (
                    (self.obj.bundle / 'nginx/nginx.conf', '/etc/nginx/nginx.conf'),
                    (self.obj.bundle / 'nginx/handygo.conf', '/etc/nginx/conf.d/handygo.conf'),
                    (self.root / 'tls', '/etc/nginx/tls'),
                    (self.root / 'acme', '/var/www/certbot'))],
        }
        self.obj.compose = Mock(side_effect=lambda *args: json.dumps({'services': {'nginx': self.service}})
                                if args[0] == 'config' else '')
        self.root_patch = patch.object(host, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def test_permission_fix_is_idempotent_and_only_changes_release_configs(self):
        secret = self.obj.bundle / 'shared.env'
        secret.write_text('fixture')
        secret.chmod(0o600)
        untouched = [self.root, self.root / 'tls', secret, *self.root.joinpath('tls').iterdir()]
        before = [(p.stat().st_mode, p.stat().st_uid, p.stat().st_gid) for p in untouched]
        for _ in range(2):
            self.obj.prepare_nginx_files()
            for path in self.obj.bundle.joinpath('nginx').iterdir():
                self.assertEqual(path.stat().st_mode & 0o777, 0o644)
                self.assertEqual(path.read_text(), 'fixture')
        self.assertEqual(before, [(p.stat().st_mode, p.stat().st_uid, p.stat().st_gid) for p in untouched])

    def test_missing_config_tls_or_acme_fails_before_docker(self):
        for path in (self.obj.bundle / 'nginx/nginx.conf', self.root / 'tls/privkey.pem', self.root / 'acme'):
            with self.subTest(path=path):
                backup = path.with_name(path.name + '.backup')
                path.rename(backup)
                try:
                    with self.assertRaisesRegex(RuntimeError, 'missing'):
                        self.obj.prepare_nginx_files()
                finally:
                    backup.rename(path)
        self.obj.compose.assert_not_called()

    def test_preflight_inherits_compose_without_user_or_volume_overrides(self):
        def compose(*args, **kwargs):
            if args[0] == 'config':
                return json.dumps({'services': {'nginx': self.service}})
            self.assertIn('ipv4_address: !reset null', Path(args[1]).read_text())
            self.assertEqual(Path(args[1]).stat().st_mode & 0o777, 0o600)
            return ''
        self.obj.compose.side_effect = compose
        self.obj.check_nginx()
        args = self.obj.compose.call_args.args
        self.assertEqual(args[0], '-f')
        self.assertEqual(args[2:], ('run', '--rm', '--no-deps', '-T', '--pull', 'never',
                                    '--entrypoint', '/bin/sh', 'nginx', '-ec', host.NGINX_PREFLIGHT))
        self.assertFalse(Path(args[1]).exists())

    def test_wrong_mounts_user_or_image_fail_before_container(self):
        mutations = (
            lambda: self.service.update(user='0:0'),
            lambda: self.service.update(image='nginx:latest'),
            lambda: self.service['volumes'][0].update(source='/tmp/wrong-release/nginx.conf'),
            lambda: self.service['volumes'][2].update(read_only=False),
            lambda: self.service['volumes'][2].update(type='volume'),
            lambda: self.service['volumes'].pop(),
            lambda: self.service['volumes'].__setitem__(1, self.service['volumes'][0]),
        )
        original = json.dumps(self.service)
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                self.service = json.loads(original)
                self.obj.compose.reset_mock()
                mutate()
                with self.assertRaisesRegex(RuntimeError, 'Unexpected Nginx'):
                    self.obj.check_nginx()
                self.assertEqual(self.obj.compose.call_count, 1)

    def test_failed_container_validation_aborts_prepare_after_pull(self):
        self.obj.owner, self.obj.validate_bundle = Mock(), Mock()
        self.obj.metadata = {'private_ip': '10.77.0.1'}
        self.obj.names = ['nginx']
        self.obj.check_memory = Mock(return_value={})
        def compose(*args, **kwargs):
            if 'run' in args:
                raise RuntimeError('fixture: unreadable private key')
            if args == ('config', '--format', 'json'):
                return json.dumps({'services': {'nginx': self.service}})
            return ''
        self.obj.compose.side_effect = compose
        with patch.object(host, 'run', side_effect=['2.30.0', 'inet 10.77.0.1/24', 'x86_64']), \
                patch.object(host.shutil, 'disk_usage', return_value=Mock(free=3 * 1024 ** 3)):
            with self.assertRaisesRegex(RuntimeError, 'unreadable private key'):
                self.obj.prepare(RELEASE)
        actions = ['run' if 'run' in call.args else call.args[0] for call in self.obj.compose.call_args_list]
        self.assertLess(actions.index('pull'), actions.index('run'))
        self.assertNotIn('up', actions)
        self.assertFalse((self.root / 'pending.json').exists())

    def test_vps2_and_vps3_do_not_run_nginx_permission_or_container_checks(self):
        self.obj.owner, self.obj.validate_bundle = Mock(), Mock()
        self.obj.check_memory = Mock(return_value={})
        self.obj.prepare_nginx_files, self.obj.check_nginx = Mock(), Mock()
        for role, ip in (('vps2', '10.77.0.2'), ('vps3', '10.77.0.3')):
            self.obj.role, self.obj.metadata, self.obj.names = role, {'private_ip': ip}, ['fixture-service']
            with patch.object(host, 'run', side_effect=['2.30.0', f'inet {ip}/24', 'x86_64']), \
                    patch.object(host.shutil, 'disk_usage', return_value=Mock(free=3 * 1024 ** 3)):
                self.assertTrue(self.obj.prepare(RELEASE)['prepared'])
        self.obj.prepare_nginx_files.assert_not_called()
        self.obj.check_nginx.assert_not_called()


@unittest.skipUnless(os.environ.get('HANDYGO_TEST_NGINX_IMAGE'),
                     'Set HANDYGO_TEST_NGINX_IMAGE to a locally pulled Nginx digest for Docker tests')
class NginxContainerTests(unittest.TestCase):
    def test_unreadable_config_on_linux_filesystem_as_uid_101(self):
        # Desktop's single-file bind ownership differs from Linux. Create this
        # negative fixture in the container filesystem, then drop to nginx 101:101.
        result = subprocess.run(
            ['docker', 'run', '--rm', '--entrypoint', '/bin/sh', os.environ['HANDYGO_TEST_NGINX_IMAGE'],
             '-ec', 'mkdir -p /etc/nginx/tls /var/www/certbot; chmod 600 /etc/nginx/nginx.conf; '
             'exec su nginx -s /bin/sh -c "$1"', 'fixture', host.NGINX_PREFLIGHT],
            capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('file missing or unreadable as 101:101: /etc/nginx/nginx.conf', result.stderr)

    def test_permissions_and_nginx_config_in_production_service(self):
        # Disposable Compose project, self-signed certificate, example ENV only.
        with tempfile.TemporaryDirectory(prefix='handygo-nginx-preflight-') as directory:
            root = Path(directory).resolve()
            bundle = root / 'releases' / RELEASE
            (bundle / 'nginx').mkdir(parents=True)
            (root / 'tls').mkdir()
            (root / 'acme').mkdir(mode=0o755)
            shutil.copy(PROD / 'nginx/nginx.conf', bundle / 'nginx/nginx.conf')
            config = (PROD / 'nginx/handygo.conf').read_text().replace('API_DOMAIN', 'fixture.example.com')
            (bundle / 'nginx/handygo.conf').write_text(config)
            compose = (PROD / 'compose.production.yml').read_text().replace('/opt/handygo/', str(root) + '/')
            compose = compose.replace('172.30.1.', '172.29.231.')
            (bundle / 'compose.production.yml').write_text(compose)
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                            '-subj', '/CN=fixture.example.com', '-keyout', str(root / 'tls/privkey.pem'),
                            '-out', str(root / 'tls/fullchain.pem')], check=True, capture_output=True)
            image = os.environ['HANDYGO_TEST_NGINX_IMAGE']
            def tls_setup(command):
                subprocess.run(['docker', 'run', '--rm', '--user', '0:0', '--entrypoint', '/bin/sh',
                                '-v', f'{root / "tls"}:/fixture', image, '-ec', command],
                               check=True, capture_output=True)
            tls_setup('chgrp 101 /fixture; chmod 750 /fixture; '
                      'chown 0:101 /fixture/*.pem; chmod 640 /fixture/*.pem')
            obj = host.Host.__new__(host.Host)
            obj.role, obj.bundle = 'vps1', bundle
            obj.manifest = {'nginx_image': image}
            obj.env = {**os.environ, 'APP_IMAGE': image, 'NGINX_IMAGE': image, 'COMPOSE_PROFILES': '',
                       'APP_ENV_FILE': str(PROD / 'env/production.env.example'), 'PRIVATE_IP': '10.77.0.1'}
            obj.command = ['docker', 'compose', '--project-name', root.name,
                           '--env-file', '/dev/null', '-f', str(bundle / 'compose.production.yml'), '--profile', 'vps1']
            occupied = None
            try:
                with patch.object(host, 'ROOT', root):
                    obj.prepare_nginx_files()
                    obj.check_nginx()
                    # Simulate an existing edge owning the production static IP.
                    occupied = subprocess.check_output(
                        ['docker', 'run', '-d', '--rm', '--network', root.name + '_default',
                         '--ip', '172.29.231.10', '--entrypoint', '/bin/sh', image, '-c', 'sleep 300'], text=True).strip()
                    obj.check_nginx()
                    cases = (
                        ('unreadable certificate', lambda: tls_setup('chmod 600 /fixture/fullchain.pem'), 'unreadable'),
                        ('unreadable key', lambda: tls_setup('chmod 600 /fixture/privkey.pem'), 'unreadable'),
                        ('world-readable key', lambda: tls_setup('chmod 644 /fixture/privkey.pem'), 'world-readable'),
                        ('TLS traversal', lambda: tls_setup('chmod 700 /fixture'), 'not traversable'),
                        ('invalid config', lambda: (bundle / 'nginx/handygo.conf').write_text('invalid_directive;'),
                         'unknown directive'),
                    )
                    for name, mutate, expected in cases:
                        with self.subTest(name=name):
                            (bundle / 'nginx/handygo.conf').write_text(config)
                            obj.prepare_nginx_files()
                            tls_setup('chmod 750 /fixture; chmod 640 /fixture/*.pem')
                            mutate()
                            # Capture diagnostics to assert the actual container failure.
                            diagnostics = io.StringIO()
                            with contextlib.redirect_stderr(diagnostics), self.assertRaises(RuntimeError):
                                obj.check_nginx()
                            self.assertIn(expected, diagnostics.getvalue())
                    # No application/production containers were started by validation.
                    running = subprocess.check_output(['docker', 'ps', '-aq', '--filter',
                                                       f'label=com.docker.compose.project={root.name}'], text=True)
                    self.assertEqual(running.strip(), '')
            finally:
                if occupied:
                    subprocess.run(['docker', 'rm', '-f', occupied], check=True, capture_output=True)
                tls_setup('chmod 750 /fixture; chmod 640 /fixture/*.pem')
                subprocess.run([*obj.command, 'down'], env=obj.env, check=True, capture_output=True)


if __name__ == '__main__':
    unittest.main()
