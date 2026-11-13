"""Validate actual Compose profile resolution with example data, never production secrets."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PROD = ROOT / 'deploy/production'
registry = json.loads((PROD / 'services.json').read_text())['services']
example = dict(line.split('=', 1) for line in (PROD / 'env/production.env.example').read_text(encoding='utf-8').splitlines()
               if line and not line.startswith('#'))
env = {**os.environ, 'APP_IMAGE': 'ghcr.io/example/backend@sha256:' + 'a' * 64,
       'NGINX_IMAGE': 'nginx@sha256:' + 'b' * 64,
       'APP_ENV_FILE': str(PROD / 'env/production.env.example'),
       'PRIVATE_IP': '10.77.0.1', 'COMPOSE_PROFILES': ''}
command = ['docker', 'compose', '--env-file', '/dev/null', '-f', str(PROD / 'compose.production.yml')]
for role in ('vps1', 'vps2', 'vps3', 'vps4'):
    env['PRIVATE_IP'] = {'vps1': '10.77.0.1', 'vps2': '10.77.0.2', 'vps3': '10.77.0.3', 'vps4': '10.77.0.4'}[role]
    output = subprocess.check_output([*command, '--profile', role, 'config', '--format', 'json'], env=env, text=True)
    services = json.loads(output)['services']
    expected = {n for n, item in registry.items() if item['host'] == role and item['deploy']}
    if role == 'vps1':
        expected.add('nginx')
    assert set(services) == expected, (role, set(services), expected)
    for name in expected - {'nginx'}:
        assert services[name]['environment']['NODE_ENV'] == 'production'
        assert services[name]['environment']['SMTP_FROM'] == example['SMTP_FROM']
        assert services[name]['environment']['PORT'] == str(registry[name]['port'])
    if role == 'vps1':
        gateway_env = services['api-gateway']['environment']
        assert gateway_env['AUTH_SERVICE_URL'] == 'http://auth-service:3001'
        assert gateway_env['USER_TRUST_SERVICE_URL'] == 'http://user-trust-service:3002'
        assert gateway_env['NOTIFICATION_SERVICE_URL'] == 'http://notification-service:3008'
    elif role == 'vps4':
        message_env = services['message-service']['environment']
        assert message_env['AUTH_SERVICE_URL'] == 'http://10.77.0.1:3001'
        assert message_env['USER_TRUST_SERVICE_URL'] == 'http://10.77.0.1:3002'
        assert message_env['NOTIFICATION_SERVICE_URL'] == 'http://10.77.0.1:3008'
    for name in expected - {'nginx'}:
        if role == 'vps1' and not registry[name].get('wireguard_http'):
            assert 'ports' not in services[name]
        else:
            port = services[name]['ports'][0]
            assert port['host_ip'] == env['PRIVATE_IP']
            assert port['target'] == registry[name]['port']
            assert port['published'] == str(registry[name]['port'])
    for name in expected:
        assert int(services[name]['memswap_limit']) == 2 * int(services[name]['mem_limit'])
    print(f'{role}: exact service set and shared raw ENV resolved correctly')

# A raw ENV snapshot may omit all optional settings. Compose must neither require
# them nor inject empty overrides that mask application defaults.
required_keys = ('NODE_ENV', 'DATABASE_URL', 'RABBITMQ_URL', 'REDIS_URL', 'OTP_SECRET',
                 'INTERNAL_SERVICE_SECRET', 'JWT_PUBLIC_KEY', 'JWT_PRIVATE_KEY',
                 'SMTP_USER', 'SMTP_PASS', 'CLOUDINARY_CLOUD_NAME',
                 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
with tempfile.TemporaryDirectory(prefix='handygo-compose-') as temporary:
    snapshot = Path(temporary) / 'shared.env'
    snapshot.write_text(''.join(f'{key}={example[key]}\n' for key in required_keys))
    snapshot.chmod(0o600)
    env['APP_ENV_FILE'] = str(snapshot)
    for role in ('vps1', 'vps2', 'vps3', 'vps4'):
        env['PRIVATE_IP'] = {'vps1': '10.77.0.1', 'vps2': '10.77.0.2', 'vps3': '10.77.0.3', 'vps4': '10.77.0.4'}[role]
        output = subprocess.check_output([*command, '--profile', role, 'config', '--format', 'json'], env=env, text=True)
        services = json.loads(output)['services']
        for name, service in services.items():
            if name == 'nginx':
                continue
            if role == 'vps1' and name == 'api-gateway':
                assert set(service['environment']) == set(required_keys) | {
                    'PORT', 'NODE_OPTIONS', 'AUTH_SERVICE_URL', 'USER_TRUST_SERVICE_URL', 'NOTIFICATION_SERVICE_URL'
                }
                assert service['environment']['AUTH_SERVICE_URL'] == 'http://auth-service:3001'
                assert service['environment']['USER_TRUST_SERVICE_URL'] == 'http://user-trust-service:3002'
                assert service['environment']['NOTIFICATION_SERVICE_URL'] == 'http://notification-service:3008'
            else:
                assert set(service['environment']) == set(required_keys) | {'PORT', 'NODE_OPTIONS'}
        print(f'{role}: Compose resolves with every optional ENV absent')
    # Infrastructure interpolation remains mandatory.
    for required in ('APP_IMAGE', 'APP_ENV_FILE', 'PRIVATE_IP', 'NGINX_IMAGE'):
        missing = {key: value for key, value in env.items() if key != required}
        result = subprocess.run([*command, '--profile', 'vps1', 'config', '--quiet'],
                                env=missing, capture_output=True, text=True)
        assert result.returncode != 0, f'{required} must remain required'
