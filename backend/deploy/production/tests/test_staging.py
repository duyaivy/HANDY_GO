"""Owned staging failures are recoverable without deleting foreign release state."""
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch

import test_release as fixtures
from test_release import host, coordinator, RELEASE, OLD

FENCE = '2:' + 'a' * 32


class StagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'releases').mkdir()
        (self.root / 'host.json').write_text(json.dumps({'role': 'vps4', 'private_ip': '10.77.0.4'}))
        self.addCleanup(patch.stopall)
        patch.object(host, 'ROOT', self.root).start()
        patch.object(host, 'run', return_value='').start()
        self.executor = patch.object(host, 'Host').start()
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w:gz') as bundle:
            item = tarfile.TarInfo('shared.env')
            item.size = 6
            bundle.addfile(item, io.BytesIO(b'KEY=x\n'))
        self.archive = output.getvalue()

    def test_interrupted_stage_is_owned_and_cleanup_is_idempotent(self):
        with patch.object(host.shutil, 'copyfileobj', side_effect=OSError('interrupted')):
            with self.assertRaises(OSError):
                host.stage_bundle('vps4', RELEASE, RELEASE, self.archive, FENCE)
        self.assertEqual(host.inspect_state('vps4')['staging'][RELEASE]['status'], 'STAGING')
        host.cleanup_staging('vps4', RELEASE)
        host.cleanup_staging('vps4', RELEASE)
        self.assertFalse((self.root / 'releases' / RELEASE).exists())
        self.assertEqual(host.inspect_state('vps4')['staging'][RELEASE]['status'], 'CLEANED')
        # Retry uses a new immutable attempt; previous ownership evidence remains.
        attempt = RELEASE[:-1] + '2'
        host.stage_bundle('vps4', attempt, attempt, self.archive, FENCE)
        self.assertEqual(host.inspect_state('vps4')['staging'][attempt]['status'], 'STAGED')

    def test_interrupted_cleanup_can_be_retried(self):
        host.stage_bundle('vps4', RELEASE, RELEASE, self.archive, FENCE)
        with patch.object(host.shutil, 'rmtree', side_effect=OSError('interrupted')):
            with self.assertRaises(OSError):
                host.cleanup_staging('vps4', RELEASE)
        self.assertEqual(host.staging_records('vps4')[RELEASE]['status'], 'STAGED')
        host.cleanup_staging('vps4', RELEASE)
        self.assertFalse((self.root / 'releases' / RELEASE).exists())

    def test_foreign_release_and_corrupted_receipt_are_preserved(self):
        directory = self.root / 'releases' / RELEASE
        directory.mkdir()
        with self.assertRaisesRegex(RuntimeError, 'prior runtime'):
            host.inspect_state('vps4')
        with self.assertRaisesRegex(RuntimeError, 'No staging ownership'):
            host.cleanup_staging('vps4', RELEASE)
        self.assertTrue(directory.exists())
        (self.root / 'staging').mkdir()
        (self.root / 'staging' / (RELEASE + '.json')).write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'Invalid staging ownership'):
            host.inspect_state('vps4')

    def test_referenced_release_never_deleted(self):
        host.stage_bundle('vps4', RELEASE, RELEASE, self.archive, FENCE)
        for name, value in [('stable', {'release_id': RELEASE}), ('pending', {'target': RELEASE})]:
            path = self.root / (name + '.json')
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(RuntimeError, 'referenced'):
                host.cleanup_staging('vps4', RELEASE)
            self.assertTrue((self.root / 'releases' / RELEASE).exists())
            path.unlink()

    def test_consumed_and_transaction_history_releases_are_never_cleaned(self):
        host.stage_bundle('vps4', RELEASE, RELEASE, self.archive, FENCE)
        receipt = self.root / 'staging' / (RELEASE + '.json')
        record = json.loads(receipt.read_text())
        record['status'] = 'CONSUMED'
        receipt.write_text(json.dumps(record))
        with self.assertRaisesRegex(RuntimeError, 'consumed'):
            host.cleanup_staging('vps4', RELEASE)
        record['status'] = 'STAGED'  # Crash between pending snapshot and consumed marker.
        receipt.write_text(json.dumps(record))
        (self.root / 'transactions').mkdir()
        for phase in ('COMMITTED', 'RESTORED', 'SNAPSHOT'):
            with self.subTest(phase=phase):
                (self.root / 'transactions' / (RELEASE + '.json')).write_text(json.dumps(
                    {'target': RELEASE, 'previous': {'release_id': OLD}, 'phase': phase}))
                with self.assertRaisesRegex(RuntimeError, 'transaction history'):
                    host.cleanup_staging('vps4', RELEASE)
                self.assertTrue((self.root / 'releases' / RELEASE).exists())

    def test_coordinator_preserves_consumed_and_historical_bundles(self):
        fixture = fixtures.ReleaseTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        obj, _ = fixture.make_coordinator()
        states = obj.inspect_cluster()
        for status in ('CONSUMED', 'STAGED'):
            for state in states.values():
                state['staging'] = {RELEASE: {'status': status}}
                state['release_history'] = [RELEASE]
            obj.cleanup_staged_releases()
            obj.executor.assert_not_called()

    def test_staging_failure_on_each_host_cleans_owned_artifacts(self):
        fixture = fixtures.ReleaseTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        for failed in coordinator.ROLES:
            with self.subTest(host=failed):
                obj, calls = fixture.make_coordinator()
                states = obj.inspect_cluster()
                cleaned = []
                def execute(role, action, target=None, **kwargs):
                    if action == 'stage':
                        states[role]['staging'] = {RELEASE: {'status': 'STAGING'}}
                        if role == failed:
                            raise RuntimeError('SSH outcome unknown')
                    if action == 'cleanup-staging':
                        cleaned.append(role)
                        states[role]['staging'][target]['status'] = 'CLEANED'
                    return {}
                obj.executor = execute
                with self.assertRaisesRegex(RuntimeError, 'FAILED_BEFORE_ROLLOUT'):
                    obj.execute()
                expected = list(coordinator.ROLES[:coordinator.ROLES.index(failed) + 1])
                self.assertEqual(cleaned, expected)
                self.assertEqual(calls, [])
