"""Pristine VPS4 preflight delegates network initialization to Compose."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import host

class VPS4NetworkTests(unittest.TestCase):
    def test_pristine_and_retry_use_compose_without_application_or_ports(self):
        with tempfile.TemporaryDirectory() as directory:
            obj = host.Host.__new__(host.Host)
            obj.role, obj.bundle = 'vps4', Path(directory)
            (obj.bundle / 'env-preflight.mjs').write_text('probe()')
            obj.compose = Mock()
            with patch.object(host, 'run') as raw_docker:
                obj.check_env_dependencies()
                obj.check_env_dependencies()
            raw_docker.assert_not_called()
            self.assertEqual(obj.compose.call_count, 2)
            args = obj.compose.call_args.args
            self.assertEqual(args[:6], ('run', '--rm', '--no-deps', '-T', '--pull', 'never'))
            self.assertEqual(args[6:8], ('--entrypoint', 'node'))
            self.assertNotIn('--service-ports', args)
            self.assertNotIn('up', args)
            self.assertIn('message-service', args)

    def test_failed_probe_propagates_and_retry_is_identical(self):
        with tempfile.TemporaryDirectory() as directory:
            obj = host.Host.__new__(host.Host)
            obj.role, obj.bundle = 'vps4', Path(directory)
            (obj.bundle / 'env-preflight.mjs').write_text('probe()')
            obj.compose = Mock(side_effect=[RuntimeError('probe failed'), None])
            with self.assertRaises(RuntimeError):
                obj.check_env_dependencies()
            obj.check_env_dependencies()
            self.assertEqual(obj.compose.call_args_list[0], obj.compose.call_args_list[1])
