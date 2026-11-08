"""Offline topology checks; no DNS lookup or production network access."""
import json
from pathlib import Path
import re
import sys
import unittest

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
from host import validate_service_endpoints


class ServiceEndpointTests(unittest.TestCase):
    def setUp(self):
        self.registry = json.loads((PROD / 'services.json').read_text())['services']
        self.values = dict(line.split('=', 1) for line in (PROD / 'env/production.env.example').read_text().splitlines()
                           if line and not line.startswith('#'))
        self.values['AI_SERVICE_URL'] = 'https://ai-fixture.region.azurecontainerapps.io'

    def test_production_example_matches_all_hosts_and_ports(self):
        validate_service_endpoints(self.values, self.registry)

    def test_every_runtime_http_client_has_registered_callers(self):
        targets = {item['url_env']: item for item in self.registry.values() if item.get('url_env')}
        for app in (PROD.parents[1] / 'apps').iterdir():
            keys = set()
            for source in (app / 'src').rglob('*.ts'):
                if source.name.endswith('.spec.ts'):
                    continue
                keys.update(re.findall(r'\b([A-Z][A-Z0-9_]*_SERVICE_URL)\b', source.read_text()))
            for key in keys - {'AI_SERVICE_URL'}:
                self.assertIn(key, targets, f'{app.name}: unregistered URL {key}')
                self.assertIn(app.name, targets[key]['http_callers'], f'{app.name}: missing caller for {key}')

    def test_cross_host_targets_reject_docker_dns_localhost_wrong_ip_and_port(self):
        for name, item in self.registry.items():
            if not item.get('url_env'):
                continue
            if not any(self.registry[caller]['host'] != item['host'] for caller in item['http_callers']):
                continue
            for value in (f'http://{name}:{item["port"]}', f'http://localhost:{item["port"]}',
                          f'http://127.0.0.1:{item["port"]}', 'http://10.77.0.99:3000', ''):
                with self.subTest(service=name, value=value), self.assertRaises(ValueError):
                    validate_service_endpoints(self.values | {item['url_env']: value}, self.registry)

    def test_origin_only_and_same_host_routes(self):
        for value in ('http://10.77.0.2:3004/api/v1', 'http://10.77.0.2:3004?token=secret',
                      'http://secret@10.77.0.2:3004', 'http://10.77.0.2:3005', 'https://10.77.0.2:3004'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_service_endpoints(self.values | {'ORDER_SERVICE_URL': value}, self.registry)
        # Auth has no host port binding; even the VPS1 host IP is not an HTTP route.
        with self.assertRaises(ValueError):
            validate_service_endpoints(self.values | {'AUTH_SERVICE_URL': 'http://10.77.0.1:3001'}, self.registry)

    def test_ai_cannot_fall_back_to_a_vps_or_localhost(self):
        for value in ('', 'http://localhost:8000', 'http://ai-service:8000', 'https://10.77.0.1:8000'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_service_endpoints(self.values | {'AI_SERVICE_URL': value}, self.registry)
