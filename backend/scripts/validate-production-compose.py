"""Validate actual Compose profile resolution with example data, never production secrets."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROD = ROOT / 'deploy/production'
registry = json.loads((PROD / 'services.json').read_text())['services']
env = {**os.environ, 'APP_IMAGE': 'ghcr.io/example/backend@sha256:' + 'a' * 64,
       'NGINX_IMAGE': 'nginx@sha256:' + 'b' * 64,
       'APP_ENV_FILE': str(PROD / 'env/production.env.example'),
       'PRIVATE_IP': '10.77.0.1', 'COMPOSE_PROFILES': ''}
command = ['docker', 'compose', '--env-file', '/dev/null', '-f', str(PROD / 'compose.production.yml')]
for role in ('vps1', 'vps2', 'vps3'):
    env['PRIVATE_IP'] = {'vps1': '10.77.0.1', 'vps2': '10.77.0.2', 'vps3': '10.77.0.3'}[role]
    output = subprocess.check_output([*command, '--profile', role, 'config', '--format', 'json'], env=env, text=True)
    services = json.loads(output)['services']
    expected = {n for n, item in registry.items() if item['host'] == role and item['deploy']}
    if role == 'vps1':
        expected.add('nginx')
    assert set(services) == expected, (role, set(services), expected)
    for name in expected - {'nginx'}:
        assert services[name]['environment']['NODE_ENV'] == 'production'
        assert services[name]['environment']['SMTP_FROM'] == 'HANDY GO <your-email@gmail.com>'
        assert services[name]['environment']['PORT'] == str(registry[name]['port'])
    for name in expected:
        assert int(services[name]['memswap_limit']) == 2 * int(services[name]['mem_limit'])
    print(f'{role}: exact service set and shared raw ENV resolved correctly')
