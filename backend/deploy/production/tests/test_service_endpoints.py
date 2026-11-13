"""Offline topology checks; no DNS lookup or production network access."""
import json
from pathlib import Path
import re
import sys
import unittest
import yaml

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
from host import validate_service_endpoints


class ServiceEndpointTests(unittest.TestCase):
    def setUp(self):
        self.registry = json.loads((PROD / 'services.json').read_text())['services']
        self.values = dict(line.split('=', 1) for line in (PROD / 'env/production.env.example').read_text().splitlines()
                           if line and not line.startswith('#'))
        self.values['AI_SERVICE_URL'] = 'https://ai-fixture.region.azurecontainerapps.io'
        self.compose = yaml.safe_load((PROD / 'compose.production.yml').read_text())

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
        for value in ('http://10.77.0.1:3000', 'http://10.77.0.1:3009', 'http://10.77.0.2:3008',
                      'http://localhost:3008', 'http://127.0.0.1:3008', 'http://0.0.0.0:3008',
                      'https://10.77.0.1:3008', 'http://10.77.0.1:3008/api/v1',
                      'http://10.77.0.1:3008?token=1', 'http://user:pass@10.77.0.1:3008'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_service_endpoints(self.values | {'NOTIFICATION_SERVICE_URL': value}, self.registry)

    def test_ai_cannot_fall_back_to_a_vps_or_localhost(self):
        for value in ('', 'http://localhost:8000', 'http://ai-service:8000', 'https://10.77.0.1:8000'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_service_endpoints(self.values | {'AI_SERVICE_URL': value}, self.registry)

    def test_gateway_compose_overrides_same_host_services_with_docker_dns(self):
        env = self.compose['services']['api-gateway']['environment']
        self.assertEqual(env.get('PORT'), '3000')
        self.assertEqual(env.get('NODE_OPTIONS'), '--max-old-space-size=80')
        self.assertEqual(env.get('AUTH_SERVICE_URL'), 'http://auth-service:3001')
        self.assertEqual(env.get('USER_TRUST_SERVICE_URL'), 'http://user-trust-service:3002')
        self.assertEqual(env.get('NOTIFICATION_SERVICE_URL'), 'http://notification-service:3008')

    def test_shared_auth_and_user_trust_urls_remain_valid_wireguard_endpoints(self):
        self.assertEqual(self.values.get('AUTH_SERVICE_URL'), 'http://10.77.0.1:3001')
        self.assertEqual(self.values.get('USER_TRUST_SERVICE_URL'), 'http://10.77.0.1:3002')
        # Rejection of invalid ports, incorrect private IPs, localhost and public addresses for shared endpoints
        for key, port in (('AUTH_SERVICE_URL', 3001), ('USER_TRUST_SERVICE_URL', 3002)):
            for invalid in (f'http://10.77.0.1:{port + 1}', 'http://10.77.0.2:3001',
                            f'http://localhost:{port}', f'http://127.0.0.1:{port}',
                            f'http://0.0.0.0:{port}', f'http://example.com:{port}',
                            f'https://10.77.0.1:{port}', f'http://10.77.0.1:{port}/api'):
                with self.subTest(key=key, invalid=invalid), self.assertRaises(ValueError):
                    validate_service_endpoints(self.values | {key: invalid}, self.registry)

    def test_notification_private_port_bound_only_to_vps1_wireguard_address(self):
        ports = self.compose['services']['notification-service'].get('ports', [])
        self.assertEqual(ports, ['${PRIVATE_IP:?WireGuard IP required}:3008:3008'])
        # Ensure never bound to 0.0.0.0 or plain host port
        for entry in ports:
            self.assertNotIn('0.0.0.0', entry)
            self.assertTrue(entry.startswith('${PRIVATE_IP'))

    def test_notification_endpoint_and_services_json_agree(self):
        target = self.registry['notification-service']
        self.assertTrue(target.get('wireguard_http'))
        self.assertEqual(target.get('port'), 3008)
        self.assertEqual(target.get('host'), 'vps1')
        self.assertEqual(self.values.get('NOTIFICATION_SERVICE_URL'), 'http://10.77.0.1:3008')
        validate_service_endpoints(self.values, self.registry)

    def test_production_verification_script_probes_gateway_dependencies_and_is_not_bypassed(self):
        verify_content = (PROD / 'verify.mjs').read_text()
        host_content = (PROD / 'host.py').read_text()
        # verify.mjs must probe AUTH, USER_TRUST, NOTIFICATION for api-gateway
        for dep in ('AUTH', 'USER_TRUST', 'NOTIFICATION', 'CATALOG', 'ORDER', 'BIDDING', 'MATCHING', 'PAYMENT', 'WALLET', 'TRACKING'):
            self.assertIn(f"'{dep}'", verify_content)
        self.assertIn('process.env[`${key}_SERVICE_URL`]', verify_content)
        # host.py must execute ops/verify.mjs inside container
        self.assertIn("node', 'ops/verify.mjs', name", host_content)

    def test_vps4_onboarding_and_migration_compatibility_intact(self):
        message = self.registry['message-service']
        self.assertEqual(message.get('host'), 'vps4')
        self.assertEqual(message.get('port'), 3009)
        self.assertEqual(message.get('url_env'), 'MESSAGE_SERVICE_URL')
        self.assertEqual(self.values.get('MESSAGE_SERVICE_URL'), 'http://10.77.0.4:3009')
        self.assertEqual(message.get('migration'), 'message')
        # Message service calls auth-service and user-trust-service on VPS1
        self.assertIn('message-service', self.registry['auth-service']['http_callers'])
        self.assertIn('message-service', self.registry['user-trust-service']['http_callers'])
        ports = self.compose['services']['message-service'].get('ports', [])
        self.assertEqual(ports, ['${PRIVATE_IP:?WireGuard IP required}:3009:3009'])
