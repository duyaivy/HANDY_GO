"""Real A -> failed B -> restored A -> C journals; Docker is mocked."""
import copy
import hashlib
import unittest
from unittest.mock import patch

import test_host_recovery as fixtures

host = fixtures.host
A, B, C = fixtures.OLD, fixtures.TARGET, fixtures.OTHER


class RollbackEvidenceTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.HostRecoveryTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.root = fixture.root
        (self.root / 'pending.json').unlink()
        for release in (A, B):
            path = self.root / 'releases' / release / 'manifest.json'
            manifest = host.read(path)
            manifest.update(container_verification_version=1,
                            services={'wallet-service': {'scope': 'health-only'}})
            host.write(path, manifest)
        self.original = {'id': 'a' * 64, 'image': 'image-id',
                         'created': '2026-11-01T00:00:00Z', 'restart_count': 0,
                         'started_at': '2026-11-01T00:00:01Z',
                         'health': 'healthy', 'running': True, 'oom_killed': False}
        self.current = copy.deepcopy(self.original)
        self.snapshot = patch.object(host.Host, '_container_snapshot', side_effect=lambda name: copy.deepcopy(self.current))
        self.snapshot.start()
        self.addCleanup(self.snapshot.stop)
        self.compose = patch.object(host.Host, 'compose', side_effect=self.docker_compose)
        self.compose.start()
        self.addCleanup(self.compose.stop)
        run = patch.object(host, 'run', return_value='image-id')
        run.start()
        self.addCleanup(run.stop)
        self.old = host.Host('vps3', A)
        self.old.begin(A)
        state = host.read(self.root / 'pending.json')
        accepted = self.old._accept_container('wallet-service', None, self.current,
                                            '2026-10-31T00:00:00Z', 'image-id')
        state.update(touched=True, phase='VERIFIED')
        state['container_evidence']['accepted'] = {'wallet-service': accepted}
        host.write(self.root / 'pending.json', state)
        self.old.commit(A)
        self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')
        self.old.authorize_finish(A)
        self.old.finish(A)
        self.original_receipt = (self.root / 'transactions' / (A + '.json')).read_bytes()

    def docker_compose(self, *args, **kwargs):
        if args[0] == 'up':
            self.assertIn('--force-recreate', args)
            self.current = {**self.original, 'id': 'b' * 64,
                            'created': '2099-01-01T00:00:00Z',
                            'started_at': '2099-01-01T00:00:01Z'}
        return ''

    def restore(self, finish=True):
        target = host.Host('vps3', B)
        target.begin(B)
        state = host.read(self.root / 'pending.json')
        state.update(touched=True, phase='APPLYING')
        host.write(self.root / 'pending.json', state)
        self.assertEqual(target.restore(B)['rollback'], 'RESTORED')
        self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')
        if finish:
            target.authorize_finish(B)
            target.finish(B)
            self.assertFalse((self.root / 'pending.json').exists())
        return target

    def begin_c(self):
        bundle = self.root / 'releases' / C
        bundle.mkdir()
        source = self.root / 'releases' / B
        for name in ('shared.env', 'compose.production.yml'):
            (bundle / name).write_bytes((source / name).read_bytes())
        manifest = host.read(source / 'manifest.json')
        manifest['release_id'] = C
        host.write(bundle / 'manifest.json', manifest)
        host.Host('vps3', C).begin(C)

    def test_verified_rollback_survives_finish_and_next_snapshot(self):
        self.restore()
        self.begin_c()
        self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')
        self.assertEqual((self.root / 'transactions' / (A + '.json')).read_bytes(), self.original_receipt)
        self.assertEqual(host.read(self.root / 'stable.json'), {'release_id': A})

    def test_restore_without_authorization_cannot_finish(self):
        target = self.restore(finish=False)
        with self.assertRaisesRegex(RuntimeError, 'Cluster verification'):
            target.finish(B)
        self.assertTrue((self.root / 'pending.json').exists())

    def test_missing_or_tampered_completed_restore_receipt_fails_closed(self):
        self.restore()
        path = self.root / 'transactions' / (B + '.json')
        receipt = host.read(path)
        for key, value in (('container_evidence', {}), ('verification', None), ('phase', 'APPLYING')):
            with self.subTest(key=key):
                host.write(path, {**receipt, key: value})
                with self.assertRaises(RuntimeError):
                    self.old._transaction_evidence()
        path.unlink()
        with self.assertRaises(RuntimeError):
            self.old._transaction_evidence()

    def test_restored_runtime_mismatches_remain_rejected(self):
        self.restore()
        for key, value, reason in (('id', 'c' * 64, 'CONTAINER_ID_MISMATCH'),
                                   ('image', 'other', 'IMAGE_MISMATCH'),
                                   ('restart_count', 1, 'RESTART_COUNT_MISMATCH'),
                                   ('started_at', '2099-01-02T00:00:00Z', 'STARTED_AT_MISMATCH')):
            with self.subTest(key=key):
                original = self.current
                self.current = {**original, key: value}
                with self.assertRaisesRegex(RuntimeError, reason):
                    self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')
                self.current = original

    def test_modern_receipts_require_explicit_completed_lifecycle(self):
        pointer = self.root / 'container-evidence.json'
        pointer.unlink(missing_ok=True)
        path = self.root / 'transactions' / (A + '.json')
        receipt = host.read(path)
        for key in ('transaction', 'phase', 'verification', 'touched', 'unlock', 'previous'):
            with self.subTest(key=key):
                broken = {**receipt, 'schema_version': 2}
                broken.pop(key)
                host.write(path, broken)
                with self.assertRaisesRegex(RuntimeError, 'INVALID_LIFECYCLE_EVIDENCE'):
                    self.old._transaction_evidence()

    def test_schema_two_and_complete_unversioned_legacy_receipts(self):
        (self.root / 'container-evidence.json').unlink()
        path = self.root / 'transactions' / (A + '.json')
        receipt = host.read(path)
        receipt['schema_version'] = 2
        for versioned in (True, False):
            if not versioned:
                receipt.pop('schema_version')
            host.write(path, receipt)
            self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')
        receipt.pop('phase')
        host.write(path, receipt)
        with self.assertRaises(RuntimeError):
            self.old._transaction_evidence()

    def test_pointer_is_fenced_by_state_token_and_requires_owner_role_and_section(self):
        self.restore()
        path = self.root / 'container-evidence.json'
        pointer = host.read(path)
        token = host.state_token()
        for changes in ({'role': 'vps1'}, {'release_id': B}, {'transaction': C},
                        {'section': 'accepted'}, {'receipt_sha256': '0' * 64}, {'version': True}):
            with self.subTest(changes=changes):
                host.write(path, {**pointer, **changes})
                self.assertNotEqual(token, host.state_token())
                with self.assertRaises(RuntimeError):
                    self.old._transaction_evidence()
        path.unlink()
        with self.assertRaises(RuntimeError):
            self.old._transaction_evidence()

    def test_pointer_hash_alone_cannot_authorize_incomplete_rollback(self):
        self.restore()
        path = self.root / 'transactions' / (B + '.json')
        receipt = host.read(path)
        pointer_path = self.root / 'container-evidence.json'
        pointer = host.read(pointer_path)
        for changes in ({'phase': 'APPLYING'}, {'verification': None}, {'touched': False},
                        {'recovery_attempt': 0}, {'recovery_decision': None},
                        {'transaction': C}, {'previous': {'release_id': C}},
                        {'container_evidence': {'version': 1, 'restored': {}}}):
            with self.subTest(changes=changes):
                host.write(path, {**receipt, **changes})
                host.write(pointer_path, {**pointer, 'receipt_sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
                with self.assertRaises(RuntimeError):
                    self.old._transaction_evidence()

    def test_pointer_write_failure_preserves_pending_and_retry_does_not_rewrite_receipt(self):
        target = self.restore(finish=False)
        target.authorize_finish(B)
        real_write = host.write
        def fail_pointer(path, record):
            if path.name == 'container-evidence.json':
                raise OSError('simulated disk failure')
            return real_write(path, record)
        with patch.object(host, 'write', side_effect=fail_pointer):
            with self.assertRaises(OSError):
                target.finish(B)
        self.assertTrue((self.root / 'pending.json').exists())
        path = self.root / 'transactions' / (B + '.json')
        before = (path.read_bytes(), path.stat().st_mtime_ns)
        target.finish(B)
        self.assertEqual((path.read_bytes(), path.stat().st_mtime_ns), before)
        self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')

    def test_conflicting_receipt_is_never_overwritten(self):
        target = self.restore(finish=False)
        target.authorize_finish(B)
        path = self.root / 'transactions' / (B + '.json')
        host.write(path, {'transaction': B, 'phase': 'APPLYING'})
        before = path.read_bytes()
        with self.assertRaisesRegex(RuntimeError, 'immutable history'):
            target.finish(B)
        self.assertEqual(path.read_bytes(), before)
        self.assertTrue((self.root / 'pending.json').exists())

    def test_malformed_modern_evidence_structure_is_rejected(self):
        (self.root / 'container-evidence.json').unlink()
        path = self.root / 'transactions' / (A + '.json')
        receipt = host.read(path)
        receipt['schema_version'] = 2
        for changes in ({'version': None}, {'version': True}, {'accepted': []},
                        {'transitions': []}, {'restored': {'wallet-service': self.original}},
                        {'accepted': {'unrelated-service': self.original}}):
            with self.subTest(changes=changes):
                host.write(path, {**receipt, 'container_evidence': {**receipt['container_evidence'], **changes}})
                with self.assertRaisesRegex(RuntimeError, 'INVALID_LIFECYCLE_EVIDENCE'):
                    self.old._transaction_evidence()

    def test_unverified_or_missing_restore_evidence_cannot_publish_pointer(self):
        target = self.restore(finish=False)
        target.authorize_finish(B)
        pointer = (self.root / 'container-evidence.json').read_bytes()
        state = host.read(self.root / 'pending.json')
        state['container_evidence']['restored'] = {}
        host.write(self.root / 'pending.json', state)
        with self.assertRaises(RuntimeError):
            target.finish(B)
        self.assertEqual((self.root / 'container-evidence.json').read_bytes(), pointer)
        self.assertTrue((self.root / 'pending.json').exists())

    def test_pending_restore_cannot_default_missing_version_or_decision(self):
        self.restore(finish=False)
        state = host.read(self.root / 'pending.json')
        for key in ('version', 'recovery_decision'):
            with self.subTest(key=key):
                broken = copy.deepcopy(state)
                (broken['container_evidence'] if key == 'version' else broken).pop(key)
                host.write(self.root / 'pending.json', broken)
                with self.assertRaises(RuntimeError):
                    self.old._transaction_evidence()

    def test_explicit_rollback_transaction_can_differ_from_target(self):
        # The deployment rollback input reuses A's bundle under a fresh owner C.
        self.old.begin(C)
        self.current = {**self.original, 'id': 'c' * 64,
                        'created': '2099-01-01T00:00:00Z', 'started_at': '2099-01-01T00:00:01Z'}
        accepted = self.old._accept_container('wallet-service', None, self.current,
                                            '2098-01-01T00:00:00Z', 'image-id')
        state = host.read(self.root / 'pending.json')
        state.update(touched=True, phase='VERIFIED')
        state['container_evidence']['accepted'] = {'wallet-service': accepted}
        host.write(self.root / 'pending.json', state)
        self.old.commit(C)
        self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')
        self.old.authorize_finish(C)
        self.old.finish(C)
        self.old._verify_bound_container('wallet-service', self.current['id'], 'image-id')
        self.assertEqual(host.read(self.root / 'container-evidence.json')['transaction'], C)
        self.assertEqual((self.root / 'transactions' / (A + '.json')).read_bytes(), self.original_receipt)


if __name__ == '__main__':
    unittest.main()
