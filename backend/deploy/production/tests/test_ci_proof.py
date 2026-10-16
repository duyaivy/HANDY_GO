"""PR CI provenance tests: deduplicate without trusting names, ancestors, or skipped jobs."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.request
import zipfile

SCRIPTS = Path(__file__).resolve().parents[3] / 'scripts'


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verify = load('verify-production-ci')
record = load('record-ci-proof')
REPOSITORY = 'owner/project'
BACKEND, WORKFLOW, HEAD, MERGED, CHECKOUT, TREE = (char * 40 for char in 'bchmst')


class ProofTests(unittest.TestCase):
    def setUp(self):
        self.run = {'id': 12, 'run_attempt': 2, 'path': verify.WORKFLOW,
                    'event': 'pull_request', 'status': 'completed', 'conclusion': 'success',
                    'head_sha': HEAD, 'pull_requests': [{'number': 8}]}
        self.pr = {'number': 8, 'merged': True, 'merge_commit_sha': MERGED,
                   'base': {'ref': 'main', 'repo': {'full_name': REPOSITORY}}, 'head': {'sha': HEAD}}
        self.proof = {'schema_version': 1, 'repository': REPOSITORY, 'workflow_path': verify.WORKFLOW,
                      'run_id': 12, 'run_attempt': 2, 'pr_number': 8, 'pr_head_sha': HEAD,
                      'checkout_sha': CHECKOUT, 'tree_sha': TREE,
                      'backend_tree_sha': BACKEND, 'ci_workflow_blob': WORKFLOW}
        self.proof['production_workflow_blob'] = WORKFLOW
        self.jobs = [{'name': 'Backend CI', 'conclusion': 'success'}, {'name': 'CI Gate', 'conclusion': 'success'}]
        self.artifact = {'id': 42, 'name': 'backend-ci-proof-2', 'expired': False}

    def valid(self):
        return verify.validate_proof(self.proof, self.run, self.pr, BACKEND, WORKFLOW, REPOSITORY)

    def run_verify(self, merged_backend=BACKEND, merged_workflow=WORKFLOW, ancestor=True):
        def git(*args):
            return {'HEAD:backend': BACKEND, 'HEAD:' + verify.WORKFLOW: WORKFLOW,
                    'HEAD:' + verify.PRODUCTION_WORKFLOW: WORKFLOW,
                    MERGED + ':' + verify.PRODUCTION_WORKFLOW: WORKFLOW,
                    MERGED + ':backend': merged_backend, MERGED + ':' + verify.WORKFLOW: merged_workflow,
                    'HEAD^{tree}': TREE}[args[1]]

        def pages(path, key):
            return iter({'workflow_runs': [self.run], 'artifacts': [self.artifact], 'jobs': self.jobs}[key])

        with patch.object(verify, 'git', side_effect=git), patch.object(verify, 'pages', side_effect=pages), \
                patch.object(verify, 'api', return_value=self.pr), \
                patch.object(verify, 'download_proof', return_value=self.proof), \
                patch.object(verify, 'ancestor', return_value=ancestor):
            return verify.verify(REPOSITORY)

    def test_successful_merged_pr_authorizes_different_release_commit_with_same_backend(self):
        evidence = self.run_verify()
        self.assertEqual(evidence['method'], 'merged-pr-ci-artifact')
        self.assertEqual(evidence['tree_sha'], TREE)
        self.assertEqual(evidence['tested_checkout_sha'], CHECKOUT)

    def test_unrelated_frontend_changes_do_not_invalidate_backend_tree(self):
        self.proof['tree_sha'] = 'f' * 40
        self.assertTrue(self.valid())

    def test_backend_or_workflow_changes_invalidate_proof(self):
        for field in ('backend_tree_sha', 'ci_workflow_blob'):
            with self.subTest(field=field):
                proof = copy.deepcopy(self.proof)
                proof[field] = 'x' * 40
                self.assertFalse(verify.validate_proof(proof, self.run, self.pr, BACKEND, WORKFLOW, REPOSITORY))

    def test_production_workflow_change_requires_new_pr_proof(self):
        self.proof['production_workflow_blob'] = 'd' * 40
        with self.assertRaises(RuntimeError):
            self.run_verify()

    def test_mismatched_run_attempt_is_rejected(self):
        self.proof['run_attempt'] = 1
        self.assertFalse(self.valid())

    def test_wrong_workflow_or_repository_is_rejected(self):
        self.run['path'] = '.github/workflows/other.yml'
        self.assertFalse(self.valid())
        self.run['path'] = verify.WORKFLOW
        self.proof['repository'] = 'attacker/project'
        self.assertFalse(self.valid())

    def test_unmerged_or_wrong_base_pr_is_rejected(self):
        self.pr['merged'] = False
        self.assertFalse(self.valid())
        self.pr['merged'] = True
        self.pr['base']['ref'] = 'other'
        self.assertFalse(self.valid())

    def test_stale_pr_head_is_rejected(self):
        self.pr['head']['sha'] = 'd' * 40
        self.assertFalse(self.valid())

    def test_skipped_backend_job_never_counts_as_tested(self):
        self.jobs[0]['conclusion'] = 'skipped'
        with self.assertRaises(RuntimeError):
            self.run_verify()

    def test_failed_ci_gate_blocks_release(self):
        self.jobs[1]['conclusion'] = 'failure'
        with self.assertRaises(RuntimeError):
            self.run_verify()

    def test_merge_conflict_resolution_in_main_is_rejected(self):
        with self.assertRaises(RuntimeError):
            self.run_verify(merged_backend='d' * 40)

    def test_merged_commit_must_be_in_release_history(self):
        with self.assertRaises(RuntimeError):
            self.run_verify(ancestor=False)

    def test_expired_or_old_attempt_artifact_is_rejected(self):
        for change in ({'expired': True}, {'name': 'backend-ci-proof-1'}):
            original = self.artifact.copy()
            self.artifact.update(change)
            with self.assertRaises(RuntimeError):
                self.run_verify()
            self.artifact = original

    def test_missing_proof_blocks_instead_of_rerunning_ci(self):
        with patch.object(verify, 'git', return_value=BACKEND), \
                patch.object(verify, 'pages', return_value=iter(())), self.assertRaises(RuntimeError):
            verify.verify(REPOSITORY)

    def test_github_api_failure_blocks_without_a_fallback(self):
        with patch.object(verify, 'git', return_value=BACKEND), \
                patch.object(verify, 'pages', side_effect=PermissionError('Actions read denied')), \
                self.assertRaises(PermissionError):
            verify.verify(REPOSITORY)

    def test_artifact_is_json_only_and_digest_checked(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr('backend-proof.json', json.dumps(self.proof))
        data = stream.getvalue()
        artifact = {**self.artifact, 'size_in_bytes': len(data), 'digest': 'sha256:' + hashlib.sha256(data).hexdigest()}
        with patch.object(verify, 'request', return_value=io.BytesIO(data)):
            self.assertEqual(verify.download_proof(REPOSITORY, artifact), self.proof)
        artifact['digest'] = 'sha256:' + '0' * 64
        with patch.object(verify, 'request', return_value=io.BytesIO(data)), self.assertRaisesRegex(ValueError, 'digest'):
            verify.download_proof(REPOSITORY, artifact)

    def test_cross_host_artifact_redirect_strips_token(self):
        req = urllib.request.Request('https://api.github.com/artifact', headers={'Authorization': 'Bearer private'})
        redirected = verify.SafeRedirect().redirect_request(req, None, 302, 'Found', {}, 'https://storage.example/file')
        self.assertFalse(redirected.has_header('Authorization'))
        with self.assertRaises(ValueError):
            verify.SafeRedirect().redirect_request(req, None, 302, 'Found', {}, 'http://storage.example/file')

    def test_recorder_uses_actual_checkout_and_run_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            event = Path(directory) / 'event.json'
            event.write_text(json.dumps({'number': 8, 'pull_request': self.pr}))
            output = Path(directory) / 'backend-proof.json'
            env = {'GITHUB_EVENT_PATH': str(event), 'GITHUB_EVENT_NAME': 'pull_request',
                   'GITHUB_REPOSITORY': REPOSITORY, 'GITHUB_RUN_ID': '12', 'GITHUB_RUN_ATTEMPT': '2'}
            values = {'HEAD': CHECKOUT, 'HEAD^{tree}': TREE, 'HEAD:backend': BACKEND,
                      'HEAD:' + verify.PRODUCTION_WORKFLOW: WORKFLOW,
                      'HEAD:' + verify.WORKFLOW: WORKFLOW}
            with patch.dict(os.environ, env), patch.object(record, 'git', side_effect=lambda *args: values[args[1]]), \
                    patch('sys.argv', ['record-ci-proof.py', str(output)]):
                record.main()
            proof = json.loads(output.read_text())
            self.assertEqual(proof['checkout_sha'], CHECKOUT)
            self.assertEqual(proof['run_attempt'], 2)


class AdminOverrideTests(unittest.TestCase):
    def setUp(self):
        env = {
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/release',
            'GITHUB_ACTOR': 'owner', 'GITHUB_TRIGGERING_ACTOR': 'owner',
            'GITHUB_REPOSITORY': REPOSITORY, 'GITHUB_RUN_ID': '15', 'GITHUB_RUN_ATTEMPT': '1',
            'BYPASS_PR_CI': 'true',
        }
        self.env = patch.dict(os.environ, env, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.permission = patch.object(verify, 'api', return_value={'permission': 'admin'})
        self.api = self.permission.start()
        self.addCleanup(self.permission.stop)
        values = {'HEAD': CHECKOUT, 'HEAD^{tree}': TREE, 'HEAD:backend': BACKEND,
                  'HEAD:' + verify.WORKFLOW: WORKFLOW, 'HEAD:' + verify.PRODUCTION_WORKFLOW: WORKFLOW}
        self.git = patch.object(verify, 'git', side_effect=lambda *args: values[args[1]])
        self.git.start()
        self.addCleanup(self.git.stop)

    def test_admin_manual_dispatch_records_exact_source_and_identity(self):
        evidence = verify.admin_override(REPOSITORY)
        self.assertEqual(evidence['method'], 'admin-manual-override')
        self.assertEqual(evidence['actor'], 'owner')
        self.assertEqual(evidence['triggering_actor'], 'owner')
        self.assertEqual(evidence['commit_sha'], CHECKOUT)
        self.assertEqual(evidence['tree_sha'], TREE)
        self.assertEqual(evidence['run_id'], 15)
        self.api.assert_called_once_with(f'/repos/{REPOSITORY}/collaborators/owner/permission')

    def test_push_and_other_refs_cannot_use_override(self):
        for changes in ({'GITHUB_EVENT_NAME': 'push'}, {'GITHUB_REF': 'refs/heads/main'},
                        {'GITHUB_REF': 'refs/tags/release'}):
            with self.subTest(changes=changes), patch.dict(os.environ, changes):
                with self.assertRaises(PermissionError):
                    verify.admin_override(REPOSITORY)
        self.api.assert_not_called()

    def test_write_maintain_and_missing_permission_are_rejected(self):
        for permission in ('write', 'maintain', 'read', 'none', None):
            with self.subTest(permission=permission):
                self.api.return_value = {'permission': permission}
                with self.assertRaises(PermissionError):
                    verify.admin_override(REPOSITORY)

    def test_both_original_and_rerun_actors_must_currently_be_admins(self):
        os.environ['GITHUB_TRIGGERING_ACTOR'] = 'other-admin'
        for permissions in (['admin', 'write'], ['write', 'admin']):
            with self.subTest(permissions=permissions):
                self.api.side_effect = [{'permission': role} for role in permissions]
                with self.assertRaises(PermissionError):
                    verify.admin_override(REPOSITORY)
        self.api.side_effect = [{'permission': 'admin'}, {'permission': 'admin'}]
        evidence = verify.admin_override(REPOSITORY)
        self.assertEqual(evidence['triggering_actor'], 'other-admin')

    def test_missing_actor_identity_is_rejected(self):
        for key in ('GITHUB_ACTOR', 'GITHUB_TRIGGERING_ACTOR'):
            with self.subTest(key=key), patch.dict(os.environ, {key: ''}):
                with self.assertRaises(PermissionError):
                    verify.admin_override(REPOSITORY)

    def test_permission_api_failure_blocks_override(self):
        self.api.side_effect = PermissionError('Permission API denied')
        with self.assertRaises(PermissionError):
            verify.admin_override(REPOSITORY)

    def test_manual_override_writes_evidence_without_claiming_ci_passed(self):
        with patch.object(verify, 'verify') as normal, patch.object(Path, 'write_text') as write, \
                patch('builtins.print') as output:
            verify.main()
        normal.assert_not_called()
        evidence = json.loads(write.call_args.args[0])
        self.assertEqual(evidence['method'], 'admin-manual-override')
        self.assertTrue(output.call_args.args[0].startswith('::warning::'))

    def test_default_flow_still_requires_pr_proof_without_automatic_bypass(self):
        for bypass in (None, 'false'):
            with self.subTest(bypass=bypass):
                os.environ.pop('BYPASS_PR_CI', None)
                if bypass is not None:
                    os.environ['BYPASS_PR_CI'] = bypass
                with patch.object(verify, 'verify', side_effect=RuntimeError('Missing PR proof')), \
                        patch.object(Path, 'write_text') as write, self.assertRaises(RuntimeError):
                    verify.main()
                write.assert_not_called()
        self.api.assert_not_called()

    def test_invalid_override_flag_is_rejected(self):
        os.environ['BYPASS_PR_CI'] = 'yes'
        with self.assertRaises(ValueError):
            verify.main()
        self.api.assert_not_called()


if __name__ == '__main__':
    unittest.main()
