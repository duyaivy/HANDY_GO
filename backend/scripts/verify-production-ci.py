#!/usr/bin/env python3
"""Authorize releases from merged PR CI proof or an explicit admin dispatch override."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

WORKFLOW = '.github/workflows/pr-ci.yml'
PRODUCTION_WORKFLOW = '.github/workflows/backend-production.yml'
MAX_ARCHIVE_BYTES = 1024 * 1024


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme != 'https':
            raise ValueError('Artifact redirects must use HTTPS')
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if urllib.parse.urlsplit(req.full_url).netloc != urllib.parse.urlsplit(newurl).netloc:
            redirected.remove_header('Authorization')
        return redirected


def request(path):
    req = urllib.request.Request('https://api.github.com' + path, headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
        'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    return urllib.request.build_opener(SafeRedirect).open(req, timeout=30)


def api(path):
    with request(path) as response:
        return json.load(response)


def pages(path, key, limit=5):
    separator = '&' if '?' in path else '?'
    for page in range(1, limit + 1):
        items = api(f'{path}{separator}per_page=100&page={page}')[key]
        yield from items
        if len(items) < 100:
            break


def git(*args):
    return subprocess.check_output(['git', *args], text=True, stderr=subprocess.DEVNULL).strip()


def ancestor(commit):
    if not re.fullmatch(r'[a-f0-9]{40,64}', commit):
        return False
    return subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'HEAD'],
                          capture_output=True, check=False).returncode == 0


def download_proof(repository, artifact):
    if artifact.get('expired') or artifact.get('size_in_bytes', MAX_ARCHIVE_BYTES + 1) > MAX_ARCHIVE_BYTES:
        raise ValueError('CI proof expired or too large')
    with request(f'/repos/{repository}/actions/artifacts/{int(artifact["id"])}/zip') as response:
        data = response.read(MAX_ARCHIVE_BYTES + 1)
    if len(data) > MAX_ARCHIVE_BYTES:
        raise ValueError('CI archive exceeds size limit')
    checksum = artifact.get('digest')
    if checksum and checksum != 'sha256:' + hashlib.sha256(data).hexdigest():
        raise ValueError('CI artifact digest mismatch')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.namelist() != ['backend-proof.json']:
            raise ValueError('Unexpected CI artifact content')
        info = archive.getinfo('backend-proof.json')
        if info.file_size > 65536:
            raise ValueError('CI proof exceeds size limit')
        return json.loads(archive.read(info))  # Never extract or execute an artifact.


def validate_proof(proof, run, pr, expected_backend, expected_workflow, repository):
    """Pure identity checks; merge ancestry and final merge trees are checked separately."""
    if (proof.get('schema_version') != 1 or proof.get('repository') != repository
            or proof.get('workflow_path') != WORKFLOW
            or proof.get('run_id') != run['id']
            or proof.get('run_attempt') != run['run_attempt']
            or run.get('path') != WORKFLOW
            or run.get('event') != 'pull_request'
            or run.get('status') != 'completed' or run.get('conclusion') != 'success'):
        return False
    if (not pr.get('merged') or pr['base']['ref'] != 'main'
            or pr['base']['repo']['full_name'] != repository
            or proof.get('pr_number') != pr['number']
            or proof.get('pr_head_sha') != pr['head']['sha']
            or run['head_sha'] not in (proof.get('pr_head_sha'), proof.get('checkout_sha'))):
        return False
    if run.get('pull_requests') and not any(item['number'] == pr['number'] for item in run['pull_requests']):
        return False
    return (proof.get('backend_tree_sha') == expected_backend
            and proof.get('ci_workflow_blob') == expected_workflow)


def verify(repository):
    expected_backend = git('rev-parse', 'HEAD:backend')
    expected_workflow = git('rev-parse', 'HEAD:' + WORKFLOW)
    expected_production = git('rev-parse', 'HEAD:' + PRODUCTION_WORKFLOW)
    for run in pages(f'/repos/{repository}/actions/workflows/pr-ci.yml/runs?event=pull_request&status=success', 'workflow_runs'):
        attempt = int(run['run_attempt'])
        artifacts = pages(f'/repos/{repository}/actions/runs/{run["id"]}/artifacts', 'artifacts')
        candidates = [item for item in artifacts if item['name'] == f'backend-ci-proof-{attempt}' and not item['expired']]
        if len(candidates) != 1:
            continue
        proof = download_proof(repository, candidates[0])
        number = proof.get('pr_number')
        if not isinstance(number, int) or number < 1:
            continue
        pr = api(f'/repos/{repository}/pulls/{number}')
        if not validate_proof(proof, run, pr, expected_backend, expected_workflow, repository):
            continue
        if proof.get('production_workflow_blob') != expected_production:
            continue
        merged_sha = pr.get('merge_commit_sha') or ''
        if not ancestor(merged_sha):
            continue
        # Catch merge-conflict resolutions introduced AFTER the PR checks.
        if (git('rev-parse', f'{merged_sha}:backend') != expected_backend
                or git('rev-parse', f'{merged_sha}:{WORKFLOW}') != expected_workflow
                or git('rev-parse', f'{merged_sha}:{PRODUCTION_WORKFLOW}') != expected_production):
            continue
        jobs = list(pages(f'/repos/{repository}/actions/runs/{run["id"]}/attempts/{attempt}/jobs', 'jobs'))
        if any(not any(job['name'] == name and job['conclusion'] == 'success' for job in jobs)
               for name in ('Backend CI', 'CI Gate')):
            continue
        return {
            'method': 'merged-pr-ci-artifact', 'tree_sha': git('rev-parse', 'HEAD^{tree}'),
            'backend_tree_sha': expected_backend, 'ci_workflow_blob': expected_workflow,
            'production_workflow_blob': expected_production,
            'run_id': run['id'], 'run_attempt': attempt, 'pr_number': number,
            'tested_checkout_sha': proof['checkout_sha'], 'tested_tree_sha': proof['tree_sha'],
            'merged_commit_sha': merged_sha, 'artifact_id': candidates[0]['id'],
        }
    raise RuntimeError('No valid merged PR CI proof for this backend tree. Rerun PR CI and merge through main; production never reruns lint/test.')


def admin_override(repository):
    """Only a manual release dispatch by current repository admins can skip PR CI."""
    if (os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch'
            or os.environ.get('GITHUB_REF') != 'refs/heads/release'):
        raise PermissionError('Admin override requires a manual dispatch on release')
    actor = os.environ.get('GITHUB_ACTOR', '')
    triggering_actor = os.environ.get('GITHUB_TRIGGERING_ACTOR', '')
    for username in dict.fromkeys((actor, triggering_actor)):
        if not username:
            raise PermissionError('Missing workflow actor identity')
        permission = api(f'/repos/{repository}/collaborators/{urllib.parse.quote(username, safe="")}/permission')
        if permission.get('permission') != 'admin':
            raise PermissionError('Only repository admins may bypass PR CI')
    return {
        'method': 'admin-manual-override', 'repository': repository,
        'actor': actor, 'triggering_actor': triggering_actor,
        'run_id': int(os.environ['GITHUB_RUN_ID']),
        'run_attempt': int(os.environ['GITHUB_RUN_ATTEMPT']),
        'commit_sha': git('rev-parse', 'HEAD'),
        'tree_sha': git('rev-parse', 'HEAD^{tree}'),
        'backend_tree_sha': git('rev-parse', 'HEAD:backend'),
        'ci_workflow_blob': git('rev-parse', 'HEAD:' + WORKFLOW),
        'production_workflow_blob': git('rev-parse', 'HEAD:' + PRODUCTION_WORKFLOW),
    }


def main():
    bypass = os.environ.get('BYPASS_PR_CI', 'false')
    if bypass not in ('true', 'false'):
        raise ValueError('BYPASS_PR_CI must be true or false')
    repository = os.environ['GITHUB_REPOSITORY']
    evidence = admin_override(repository) if bypass == 'true' else verify(repository)
    Path('ci-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    if bypass == 'true':
        message = (f'PR CI proof bypassed by repository admin {evidence["triggering_actor"]} '
                   f'for commit {evidence["commit_sha"]}; application lint/tests were not verified.')
        print('::warning::' + message)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as summary:
                summary.write('### Admin PR CI override\n\n' + message + '\n')
    else:
        print(f'Backend source verified by PR #{evidence["pr_number"]}, CI run {evidence["run_id"]}; no duplicate lint/test')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # API credentials/signed URLs must not appear in Actions error output.
        print(f'::error::Deployment blocked: CI proof verification failed ({type(error).__name__}). '
              'Check merged PR CI, artifacts/retention and API read permissions. '
              'Admin bypass requires a manual release dispatch and current admin permission '
              'for both the original and rerun actors.', file=sys.stderr)
        sys.exit(1)
