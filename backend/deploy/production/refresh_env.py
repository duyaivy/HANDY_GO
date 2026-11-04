#!/usr/bin/env python3
"""Manual config-only release: reuse the *deployed* images, migration state and bundle.

The existing coordinator handles lock/snapshot/prepare/apply/verify/commit/rollback.
Never mutate an existing immutable release or a running container's ENV in place.
"""
import argparse
import copy
import datetime
import io
import json
from pathlib import Path
import re
import shlex
import signal
import tarfile
import time

from orchestrate import Coordinator, ROLES, ROOT, digest, save

FILES = (
    'host.py',
    'release_log.py',
    'services.json',
    'compose.production.yml',
    'nginx/nginx.conf',
    'nginx/handygo.conf',
)
RELEASE_ID = re.compile(r'prod-[0-9]{8}-[0-9]+-a[0-9]+')
PREFLIGHT = 'env-preflight.mjs'


class EnvRefreshCoordinator(Coordinator):
    def execute(self):
        self.rollout_deadline = time.monotonic() + self.args.rollout_timeout_minutes * 60
        super().execute()

    def bundle(self):
        previous_ids = []
        previous_manifests = []
        for role in ROLES:
            state = json.loads(self.ssh_run(role, f'cat {ROOT}/stable.json', label='read stable release ID'))
            previous_id = state.get('release_id')
            if not isinstance(previous_id, str) or not RELEASE_ID.fullmatch(previous_id):
                raise RuntimeError(f'{role}: no valid stable production release')
            previous_ids.append(previous_id)
            path = f'{ROOT}/releases/{previous_id}/manifest.json'
            previous_manifests.append(json.loads(self.ssh_run(role, shlex.join(['cat', path]),
                                                              label='read stable manifest')))

        if len(set(previous_ids)) != 1 or any(m != previous_manifests[0] for m in previous_manifests):
            raise RuntimeError('Stable release manifests differ across VPS; reconcile before ENV refresh')

        previous_id = previous_ids[0]
        previous = previous_manifests[0]
        if previous.get('release_id') != previous_id or previous.get('schema_version') != 1:
            raise RuntimeError('Unsupported stable release manifest')
        if not previous.get('rollback_compatible'):
            raise RuntimeError('Stable release cannot be safely rolled back')
        if set(previous.get('files', {})) not in (set(FILES), set(FILES) | {PREFLIGHT}):
            raise RuntimeError('Unexpected stable release file set; review configuration changes first')

        # Use exactly the deployed Compose, Nginx configuration, service registry and
        # images. Read no old secrets into GitHub Actions, and do not build/pull new images.
        files = {}
        for name in FILES:
            # Keep the executor and its diagnostic helper compatible with this workflow.
            if name in ('host.py', 'release_log.py'):
                content = Path(__file__).with_name(name).read_bytes()
            else:
                source = f'{ROOT}/releases/{previous_id}/{name}'
                content = self.ssh_run('vps1', shlex.join(['cat', source]), label=f'read deployed {name}')
                if digest(content) != previous['files'][name]:
                    raise RuntimeError(f'Stable bundle checksum mismatch: {name}')
            files[name] = content
        files[PREFLIGHT] = Path(__file__).with_name(PREFLIGHT).read_bytes()

        from host import validate_env
        env_path = Path(self.args.env_file)
        validate_env(env_path)
        shared_env = env_path.read_bytes()

        manifest = copy.deepcopy(previous)
        manifest.update({
            'release_id': self.target,
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'run_id': self.args.run_id,
            'run_attempt': self.args.attempt,
            'run_migrations': False,
            'config_sha256': digest(shared_env),
            'env_refresh': True,
            'env_refresh_from': previous_id,
            'files': {name: digest(content) for name, content in files.items()},
        })
        save(self.output / 'manifest.json', manifest)
        files['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
        files['shared.env'] = shared_env

        archive_bytes = io.BytesIO()
        with tarfile.open(fileobj=archive_bytes, mode='w:gz') as archive:
            for name, content in files.items():
                item = tarfile.TarInfo(name)
                item.size = len(content)
                item.mode = 0o600
                archive.addfile(item, io.BytesIO(content))
        print(f'ENV-only release {self.target} from {previous_id}; '
              f'backend services: {sum(name != "nginx" for names in manifest["hosts"].values() for name in names)}; '
              'existing image digests preserved; migrations disabled', flush=True)
        return manifest, archive_bytes.getvalue()

    def recover(self):
        from recovery import reconcile
        self.rollout_deadline = None
        self.journal['operation'] = 'env-recovery'
        with self.cluster_lock():
            reconcile(self, env_only=True)


def main():
    parser = argparse.ArgumentParser(description='Refresh all Handy Go production backend ENV without image builds')
    parser.add_argument('--run-id', required=True, type=int)
    parser.add_argument('--attempt', required=True, type=int)
    parser.add_argument('--env-file')
    parser.add_argument('--domain', required=True)
    parser.add_argument('--output', default='release-output')
    parser.add_argument('--recover-only', action='store_true')
    parser.add_argument('--rollout-timeout-minutes', type=int, default=30)
    args = parser.parse_args()
    if args.run_id < 1 or args.attempt < 1 or not 1 <= args.rollout_timeout_minutes <= 60:
        parser.error('Positive run ID/attempt and a rollout timeout of 1–60 minutes are required')
    if not args.recover_only and not args.env_file:
        parser.error('--env-file is required for a refresh')
    args.rollback_release = ''
    args.run_migrations = False
    # Give ordinary SIGTERM a compensation path. Hard runner/process loss is handled
    # by the workflow's independent recovery job using the VPS-side pending state.
    interrupted = False
    def interrupt(signum, frame):
        nonlocal interrupted
        if not interrupted:
            interrupted = True
            raise InterruptedError('Refresh interrupted; recovery required')
    signal.signal(signal.SIGTERM, interrupt)
    coordinator = EnvRefreshCoordinator(args)
    if args.recover_only:
        coordinator.recover()
    else:
        coordinator.execute()


if __name__ == '__main__':
    main()
