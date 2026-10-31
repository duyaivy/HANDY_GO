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
        """Recover only this Actions attempt, using durable host state, even without artifacts.

        Runs on a separate runner after failure/cancellation. Never deletes another
        transaction's lock, and rechecks ownership under the host's flock on mutation.
        """
        self.rollout_deadline = None
        self.journal['operation'] = 'env-recovery'
        self.journal['status'] = 'RECOVERING'
        self.persist()
        try:
            self._recover()
        except Exception as error:
            self.journal['status'] = 'FAILED_NEEDS_INTERVENTION'
            from release_log import redact
            self.journal['error'] = redact(error)
            self.persist()
            raise

    def _recover(self):
        inspect = (
            'import json; from pathlib import Path; '
            f'r=Path({ROOT!r}); '
            'print(json.dumps({n: json.loads((r/(n+".json")).read_text()) '
            'if (r/(n+".json")).exists() else None for n in ("pending", "stable")}))'
        )
        states = {role: json.loads(self.ssh_run(role, shlex.join(['python3', '-c', inspect]),
                                                label='inspect durable transaction state')) for role in ROLES}
        pattern = re.compile(rf'prod-[0-9]{{8}}-{self.args.run_id}-a{self.args.attempt}')
        owned = {}
        for role, state in states.items():
            pending = state['pending']
            if pending:
                if not pattern.fullmatch(str(pending.get('transaction', ''))):
                    raise RuntimeError(f'{role}: pending transaction belongs to another run; use production reconciliation')
                if pending.get('target') != pending['transaction']:
                    raise RuntimeError(f'{role}: ENV recovery refuses an unrelated rollback target')
                owned[role] = pending
        if not owned:
            self.journal['status'] = 'RECOVERY_NOT_NEEDED'
            self.persist()
            return
        transactions = {p['transaction'] for p in owned.values()}
        if len(transactions) != 1:
            raise RuntimeError('Hosts disagree on recovery transaction')
        self.transaction = self.target = transactions.pop()
        self.journal.update(transaction=self.transaction, target_release=self.target)
        manifests = [json.loads(self.ssh_run(role, shlex.join([
            'cat', f'{ROOT}/releases/{self.target}/manifest.json']), label='validate ENV recovery manifest'))
            for role in ROLES]
        manifest = manifests[0]
        if any(m != manifest for m in manifests) or not (
                manifest.get('release_id') == self.target and manifest.get('env_refresh') is True
                and manifest.get('run_id') == self.args.run_id and manifest.get('run_attempt') == self.args.attempt):
            raise RuntimeError('Recovery requires matching ENV-only manifests for this exact Actions attempt')

        stable_ids = {role: (state['stable'] or {}).get('release_id') for role, state in states.items()}
        if all(value == self.target for value in stable_ids.values()):
            # The rollout committed globally; only cleanup was interrupted. Reverify
            # the entire release before finishing the remaining matching locks.
            if any(p['phase'] not in ('VERIFIED', 'COMMITTED') for p in owned.values()):
                raise RuntimeError('Committed release has an unexpected pending phase')
            for role in ROLES:
                self.remote(role, 'verify', wait_lock=True)
            self.public_smoke(manifest)
            for role, pending in owned.items():
                if pending['phase'] == 'VERIFIED':
                    self.remote(role, 'commit', wait_lock=True)
            status = 'STABLE'
        else:
            previous_ids = {(p.get('previous') or {}).get('release_id') for p in owned.values()}
            if len(previous_ids) != 1:
                raise RuntimeError('Hosts disagree on previous stable release')
            previous_id = previous_ids.pop()
            if not isinstance(previous_id, str) or not RELEASE_ID.fullmatch(previous_id):
                raise RuntimeError('ENV recovery requires a previous stable release')
            if any(stable_ids[role] != previous_id for role in ROLES if role not in owned):
                raise RuntimeError('An unlocked host has an unexpected stable release; keep locks for reconciliation')
            for role in reversed(ROLES):
                if role in owned:
                    result = self.remote(role, 'restore', wait_lock=True)
                    self.journal['rollback'][role] = result['rollback']
                    if result['rollback'] not in ('RESTORED', 'NOT_NEEDED'):
                        raise RuntimeError(f'{role}: previous release was not restored')
            for role in ROLES:
                self.remote(role, 'verify', previous_id)
            previous = json.loads(self.ssh_run('vps1', shlex.join([
                'cat', f'{ROOT}/releases/{previous_id}/manifest.json']), label='read restored manifest'))
            self.public_smoke(previous)
            status = 'FAILED_ROLLBACK_SUCCESS'
        # Locks remain if any restore/verification above fails. Retrying recovery is safe.
        for role in owned:
            self.remote(role, 'finish', wait_lock=True)
        self.journal['status'] = status
        self.persist()


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
