"""Container identity verification across release, repeated probes and recovery."""
import contextlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

PROD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROD))
spec = importlib.util.spec_from_file_location('host_container_verification', PROD / 'host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class ContainerVerificationTests(unittest.TestCase):
    def test_created_after_preserves_nanosecond_ordering(self):
        earlier = '2026-11-04T00:00:00.123456001Z'
        later = '2026-11-04T00:00:00.123456999Z'
        self.assertFalse(host.Host._created_after(earlier, later))
        self.assertTrue(host.Host._created_after(later, earlier))
        self.assertTrue(host.Host._created_after(later, later))

    def test_created_after_compares_offsets_and_fraction_lengths(self):
        intent = '2026-11-04T00:00:00.1Z'
        for created in ('2026-11-04T07:00:00.100000000+07:00',
                        '2026-11-03T19:00:00.100-05:00'):
            with self.subTest(created=created):
                self.assertTrue(host.Host._created_after(created, intent))
                self.assertTrue(host.Host._created_after(intent, created))
        self.assertTrue(host.Host._created_after('2026-11-04T00:00:00Z',
                                                 '2026-11-04T00:00:00.000000000Z'))

    def test_created_after_rejects_invalid_timestamps(self):
        valid = '2026-11-04T00:00:00Z'
        for invalid in (None, 42, '', 'invalid', '2026-11-04T00:00:00',
                        '2026-11-04T00:00:00.1234567890Z',
                        '2026-11-04T00:00:00+24:00', '2026-02-30T00:00:00Z'):
            with self.subTest(invalid=invalid):
                self.assertFalse(host.Host._created_after(invalid, valid))
                self.assertFalse(host.Host._created_after(valid, invalid))

    def make_host(self, restart=2, started='2026-11-03T01:02:00Z', container='a' * 64,
                  health='healthy', image='image-id'):
        obj = host.Host.__new__(host.Host)
        obj.role, obj.release_id, obj.names = 'vps2', 'prod-20261104-42-a1', ['order-service']
        obj.manifest = {'container_verification_version': 1,
                        'app_image': 'ghcr.io/example/backend@sha256:' + 'a' * 64,
                        'services': {'order-service': {'scope': 'health-only'}}}
        obj.compose = Mock(side_effect=[container[:12]] * 6)
        state = {'Running': True, 'OOMKilled': False, 'Health': {'Status': health},
                 'StartedAt': started, 'FinishedAt': '0001-01-01T00:00:00Z', 'ExitCode': 0}
        full = {'Id': container, 'Image': image, 'Created': '2026-11-03T01:00:00Z',
                'RestartCount': restart, 'State': state}
        def run(argv, **kwargs):
            fmt = argv[argv.index('--format') + 1]
            if fmt == '{{json .State}}': return json.dumps(state)
            if fmt == '{{.Id}}': return 'image-id'
            if fmt == '{{.Image}}': return image
            if fmt == '{{.RestartCount}}': return str(restart)
            if fmt == '{{json .}}': return json.dumps(full)
            raise AssertionError(argv)
        obj._transaction_evidence = Mock(return_value={'order-service': {
            'id': 'a' * 64, 'image': 'image-id', 'created': '2026-11-03T01:00:00Z', 'restart_count': 2,
            'started_at': '2026-11-03T01:02:00Z', 'baseline_restart_count': 2,
            'baseline_started_at': '2026-11-03T01:02:00Z',
            'classification': 'historical_restart' if restart else 'unchanged'}})
        return obj, run, state, full

    def test_historical_restart_is_classified_and_accepted_only_when_unchanged(self):
        obj, run, _, _ = self.make_host(restart=2)
        with patch.object(host, 'run', side_effect=run):
            self.assertTrue(obj.verify()['verified'])
            self.assertTrue(obj.verify()['verified'])
        self.assertEqual(obj._transaction_evidence.call_count, 2)

    def test_restart_after_apply_and_same_counter_with_new_start_time_fail(self):
        for restart, started in ((3, '2026-11-04T01:00:00Z'),
                                 (2, '2026-11-04T01:00:00Z'),
                                 (1, '2026-11-03T01:02:00Z')):
            with self.subTest(restart=restart, started=started):
                obj, run, _, _ = self.make_host(restart=restart, started=started)
                with patch.object(host, 'run', side_effect=run), self.assertRaisesRegex(RuntimeError, 'changed, restarted'):
                    obj.verify()

    def test_unexpected_replacement_or_image_mismatch_fails(self):
        obj, run, _, _ = self.make_host(container='b' * 64, restart=0)
        with patch.object(host, 'run', side_effect=run), self.assertRaisesRegex(RuntimeError, 'changed, restarted'):
            obj.verify()
        obj, run, _, _ = self.make_host(restart=0, image='other-image')
        with patch.object(host, 'run', side_effect=run), self.assertRaisesRegex(RuntimeError, 'Image mismatch'):
            obj.verify()

    def test_unhealthy_service_and_missing_transaction_baseline_fail_closed(self):
        obj, run, _, _ = self.make_host(health='unhealthy')
        with patch.object(host, 'run', side_effect=run), self.assertRaisesRegex(RuntimeError, 'not healthy'):
            obj.verify()
        obj, run, _, _ = self.make_host(restart=0)
        obj._transaction_evidence = Mock(side_effect=RuntimeError('Container verification baseline missing'))
        with patch.object(host, 'run', side_effect=run), self.assertRaisesRegex(RuntimeError, 'baseline missing'):
            obj.verify()

    def test_new_release_container_must_be_created_after_intent_with_zero_restarts(self):
        obj = host.Host.__new__(host.Host)
        obj.role = 'vps2'
        before = {'id': 'a' * 64, 'image': 'old', 'created': '2026-11-03T00:00:00Z',
                  'restart_count': 3, 'started_at': '2026-11-03T00:01:00Z'}
        after = {'id': 'b' * 64, 'image': 'image-id', 'created': '2026-11-04T00:01:00Z',
                 'restart_count': 0, 'started_at': '2026-11-04T00:01:01Z',
                 'running': True, 'oom_killed': False, 'health': 'healthy'}
        self.assertEqual(obj._accept_container('order-service', before, after, '2026-11-04T00:00:00Z', 'image-id')['classification'], 'created_by_release')
        historical = {**before, 'running': True, 'health': 'healthy', 'oom_killed': False}
        same = {**historical}
        self.assertEqual(obj._accept_container('order-service', historical, same, '2026-11-04T00:00:00Z', 'old', historical_baseline=historical)['classification'], 'historical_restart')
        unhealthy = {**historical, 'health': 'unhealthy'}
        with self.assertRaisesRegex(RuntimeError, 'baseline was not healthy'):
            obj._accept_container('order-service', unhealthy, same, '2026-11-04T00:00:00Z', 'old', historical_baseline=unhealthy)
        after['restart_count'] = 1
        with self.assertRaisesRegex(RuntimeError, 'restart during rollout'):
            obj._accept_container('order-service', before, after, '2026-11-04T00:00:00Z', 'image-id')
        after['restart_count'] = 0
        with self.assertRaisesRegex(RuntimeError, 'replacement or restart'):
            obj._accept_container('order-service', before, after, '2026-11-04T00:02:00Z', 'image-id')
