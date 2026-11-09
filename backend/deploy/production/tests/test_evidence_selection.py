"""Durable receipt selection with real journals; Docker is always mocked."""
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import test_container_verification as fixtures

host = fixtures.host

STABLE = 'prod-20261106-42173362859-a1'
TARGET = 'prod-20261109-42631371549-a1'


class EvidenceSelectionTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        root_patch = patch.object(host, 'ROOT', self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)
        self.obj, self.run, _, full = fixtures.ContainerVerificationTests().make_host(restart=0)
        self.obj.compose.side_effect = None
        self.obj.compose.return_value = 'a' * 12
        self.obj.role = 'vps3'
        self.obj.names = ['catalog-service']
        self.obj.manifest['services'] = {'catalog-service': {'scope': 'health-only'}}
        self.obj.release_id = STABLE
        del self.obj._transaction_evidence
        self.accepted = {
            'id': full['Id'], 'image': full['Image'], 'created': full['Created'],
            'restart_count': 0, 'started_at': full['State']['StartedAt'],
            'classification': 'created_by_release', 'running': True,
            'health': 'healthy', 'oom_killed': False,
        }
        self.evidence = {'version': 1, 'accepted': {'catalog-service': self.accepted}}
        self.pending = {'transaction': TARGET, 'target': TARGET,
                        'previous': {'release_id': STABLE}, 'phase': 'SNAPSHOT',
                        'touched': False, 'container_evidence': {
                            'version': 1, 'captured_at': '2026-11-09T00:00:00Z',
                            'baseline': {'catalog-service': copy.deepcopy(self.accepted)}}}
        (self.root / 'transactions').mkdir()
        self.receipt = self.root / 'transactions' / (STABLE + '.json')
        host.write(self.receipt, {'schema_version': 2, 'transaction': STABLE, 'target': STABLE,
                                'previous': None, 'verification': 'CLUSTER_VERIFIED',
                                'phase': 'COMMITTED', 'touched': True,
                                'container_evidence': self.evidence, 'unlock': 'VERIFIED_FINISH'})
        self.save_pending()

    def save_pending(self):
        host.write(self.root / 'pending.json', self.pending)

    def verify(self):
        with patch.object(host, 'run', side_effect=self.run):
            return self.obj.verify()

    def test_untouched_snapshot_baseline_only_verifies_durable_accepted(self):
        self.assertNotIn('restored', self.pending['container_evidence'])
        self.assertTrue(self.verify()['verified'])

    def test_absent_restored_returns_accepted_receipt_not_empty_mapping(self):
        self.assertEqual(self.obj._transaction_evidence(), self.evidence['accepted'])

    def test_completed_restore_uses_its_evidence_instead_of_old_receipt(self):
        self.pending.update(phase='RESTORED', touched=True, recovery_decision='RESTORE_PREVIOUS')
        restored = copy.deepcopy(self.accepted)
        self.pending['container_evidence']['restored'] = {'catalog-service': restored}
        self.save_pending()
        self.receipt.unlink()
        self.assertTrue(self.verify()['verified'])

    def test_missing_or_malformed_restore_never_falls_back(self):
        self.pending.update(phase='RESTORED', touched=True, recovery_decision='RESTORE_PREVIOUS')
        for value in (None, {}, [], 'private-secret', {'catalog-service': None},
                      {'catalog-service': {'classification': 'created_by_release'}}):
            with self.subTest(value=value):
                self.pending['container_evidence']['restored'] = value
                self.save_pending()
                with self.assertRaisesRegex(RuntimeError, 'MISSING_RESTORED_EVIDENCE|INVALID_LIFECYCLE_EVIDENCE'):
                    self.verify()

    def test_restore_in_progress_and_contradictory_snapshot_fail_closed(self):
        for changes in ({'phase': 'APPLYING', 'touched': True, 'recovery_decision': 'RESTORE_PREVIOUS'},
                        {'recovery_decision': 'RESTORE_PREVIOUS'},
                        {'phase': 'RESTORED'}, {'touched': True}):
            with self.subTest(changes=changes):
                original = copy.deepcopy(self.pending)
                self.pending.update(changes)
                self.save_pending()
                with self.assertRaisesRegex(RuntimeError, 'INVALID_LIFECYCLE_EVIDENCE'):
                    self.verify()
                self.pending = original

    def test_untrusted_snapshot_restored_section_is_not_used(self):
        self.pending['container_evidence']['restored'] = {'catalog-service': self.accepted}
        self.save_pending()
        with self.assertRaisesRegex(RuntimeError, 'INVALID_LIFECYCLE_EVIDENCE'):
            self.verify()

    def test_identity_image_restart_and_start_time_mismatches_rejected(self):
        for key, value, reason in (
                ('id', 'b' * 64, 'CONTAINER_ID_MISMATCH'),
                ('image', 'other-image', 'IMAGE_MISMATCH'),
                ('restart_count', 1, 'RESTART_COUNT_MISMATCH'),
                ('started_at', '2026-11-09T00:00:00Z', 'STARTED_AT_MISMATCH')):
            with self.subTest(key=key):
                current = {**self.accepted, key: value}
                with patch.object(self.obj, '_container_snapshot', return_value=current):
                    with self.assertRaisesRegex(RuntimeError, reason):
                        self.obj._verify_bound_container('catalog-service', 'a' * 12, 'image-id')

    def test_missing_malformed_or_wrong_owner_durable_receipt_rejected(self):
        self.receipt.unlink()
        with self.assertRaisesRegex(RuntimeError, 'MISSING_ACCEPTED_EVIDENCE'):
            self.verify()
        for value in ([], {}, {'target': TARGET, 'container_evidence': self.evidence},
                      {'target': STABLE, 'container_evidence': []}):
            with self.subTest(value=value):
                host.write(self.receipt, value)
                with self.assertRaisesRegex(RuntimeError, 'INVALID_LIFECYCLE_EVIDENCE'):
                    self.verify()
        self.receipt.write_text('{private-secret')
        with self.assertRaises(RuntimeError) as caught:
            self.verify()
        self.assertNotIn('private-secret', str(caught.exception))

    def test_active_target_uses_pending_accepted_and_never_falls_back(self):
        self.obj.release_id = TARGET
        self.pending.update(phase='APPLYING', touched=True)
        self.pending['container_evidence'] = copy.deepcopy(self.evidence)
        self.save_pending()
        self.assertTrue(self.verify()['verified'])
        host.write(self.root / 'transactions' / (TARGET + '.json'),
                   {'target': TARGET, 'container_evidence': self.evidence})
        for value in (None, {}, [], {'version': 1, 'accepted': []}):
            self.pending['container_evidence'] = value
            self.save_pending()
            with self.assertRaisesRegex(RuntimeError, 'MISSING_ACCEPTED_EVIDENCE|INVALID_LIFECYCLE_EVIDENCE'):
                self.verify()

    def test_legacy_pending_without_phase_and_without_evidence_uses_receipt(self):
        self.pending.pop('phase')
        self.pending.pop('container_evidence')
        self.save_pending()
        self.assertTrue(self.verify()['verified'])

    def test_no_pending_uses_existing_durable_receipt(self):
        (self.root / 'pending.json').unlink()
        self.assertTrue(self.verify()['verified'])

    def test_malformed_pending_does_not_fall_back(self):
        for pending in ([], {}, {**self.pending, 'container_evidence': []},
                        {**self.pending, 'container_evidence': None},
                        {**self.pending, 'previous': []},
                        {**self.pending, 'container_evidence': {'version': 99}}):
            host.write(self.root / 'pending.json', pending)
            with self.assertRaisesRegex(RuntimeError, 'INVALID_LIFECYCLE_EVIDENCE'):
                self.verify()

    def test_invalid_accepted_record_is_rejected_without_rebaselining(self):
        (self.root / 'pending.json').unlink()
        for changes in ({'id': None}, {'restart_count': False}, {'started_at': None},
                        {'classification': 'unknown'}, {'health': 'unhealthy'},
                        {'running': False}, {'oom_killed': True}):
            with self.subTest(changes=changes):
                record = {**self.accepted, **changes}
                receipt = host.read(self.receipt)
                receipt['container_evidence'] = {'version': 1, 'accepted': {'catalog-service': record}}
                host.write(self.receipt, receipt)
                before = self.receipt.read_bytes()
                with self.assertRaisesRegex(RuntimeError, 'INVALID_LIFECYCLE_EVIDENCE'):
                    self.verify()
                self.assertEqual(self.receipt.read_bytes(), before)

    def test_bound_runtime_health_is_still_enforced(self):
        for changes in ({'health': 'unhealthy'}, {'running': False}, {'oom_killed': True}):
            with self.subTest(changes=changes):
                with patch.object(self.obj, '_container_snapshot', return_value={**self.accepted, **changes}):
                    with self.assertRaisesRegex(RuntimeError, 'UNHEALTHY'):
                        self.obj._verify_bound_container('catalog-service', 'a' * 12, 'image-id')

    def test_legacy_manifest_keeps_zero_restart_health_image_policy(self):
        self.obj.manifest.pop('container_verification_version')
        self.receipt.unlink()
        self.assertTrue(self.verify()['verified'])

    def test_early_image_digest_resolution_and_health_checks_have_reason_codes(self):
        for reason, options in (('IMAGE_MISMATCH', {'image': 'other-image'}),
                                ('UNHEALTHY', {'health': 'unhealthy'})):
            with self.subTest(reason=reason):
                obj, run, _, _ = fixtures.ContainerVerificationTests().make_host(restart=0, **options)
                with patch.object(host, 'run', side_effect=run):
                    with self.assertRaisesRegex(RuntimeError, reason):
                        obj.verify()


if __name__ == '__main__':
    unittest.main()
