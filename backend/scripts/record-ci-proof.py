#!/usr/bin/env python3
"""Record the actual PR checkout AFTER backend gates pass. Contains no secrets."""
import json
import os
from pathlib import Path
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    pr = event['pull_request']
    if os.environ['GITHUB_EVENT_NAME'] != 'pull_request' or pr['base']['ref'] != 'main':
        raise ValueError('Proof is only recorded for PR CI targeting main')
    proof = {
        'schema_version': 1,
        'repository': os.environ['GITHUB_REPOSITORY'],
        'workflow_path': '.github/workflows/pr-ci.yml',
        'run_id': int(os.environ['GITHUB_RUN_ID']),
        'run_attempt': int(os.environ['GITHUB_RUN_ATTEMPT']),
        'pr_number': event['number'],
        'pr_head_sha': pr['head']['sha'],
        'checkout_sha': git('rev-parse', 'HEAD'),
        'tree_sha': git('rev-parse', 'HEAD^{tree}'),
        'backend_tree_sha': git('rev-parse', 'HEAD:backend'),
        'ci_workflow_blob': git('rev-parse', 'HEAD:.github/workflows/pr-ci.yml'),
        'production_workflow_blob': git('rev-parse', 'HEAD:.github/workflows/backend-production.yml'),
    }
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(proof, indent=2) + '\n')
    print('Recorded backend CI proof for the actual checkout')


if __name__ == '__main__':
    main()
