#!/usr/bin/env python3
"""Runner coordinator: stage all hosts, roll out serially, compensate every participant."""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import time
import urllib.request

from release_log import emit, load_secrets, redact

HERE = Path(__file__).resolve().parent
ROLES = ('vps3', 'vps2', 'vps1')
ROOT = '/opt/handygo'
ID = r'prod-[0-9]{8}-[0-9]+-a[0-9]+'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + '\n')


class Coordinator:
    def __init__(self, args):
        self.args = args
        if args.env_file:
            load_secrets(args.env_file)
        self.transaction = datetime.datetime.now(datetime.timezone.utc).strftime('prod-%Y%m%d-') + f'{args.run_id}-a{args.attempt}'
        self.target = args.rollback_release or self.transaction
        if not re.fullmatch(ID, self.target) or not re.fullmatch(ID, self.transaction):
            raise ValueError('Invalid release identity')
        user = os.environ['DEPLOY_USER']
        if not re.fullmatch(r'[a-z_][a-z0-9_-]*', user):
            raise ValueError('Invalid SSH user')
        self.targets = {}
        self.identities = {}
        for role in ROLES:
            host = os.environ[role.upper() + '_HOST']
            if not re.fullmatch(r'[a-zA-Z0-9.-]+', host):
                raise ValueError('SSH host must be a hostname or IPv4 address')
            self.targets[role] = f'{user}@{host}'
            identity = Path.home() / '.ssh' / f'handygo_{role}'
            if not identity.is_file():
                raise ValueError(f'Missing SSH identity for {role}: install {role.upper()}_SSH_KEY first')
            self.identities[role] = str(identity)
        self.ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                    '-o', 'StrictHostKeyChecking=accept-new',
                    '-o', f'UserKnownHostsFile={Path.home() / ".ssh" / "handygo_known_hosts"}',
                    '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3']
        self.journal = {'transaction': self.transaction, 'target_release': self.target,
                        'operation': 'rollback' if args.rollback_release else 'deploy',
                        'status': 'PREPARING', 'hosts': {}, 'rollback': {}}
        self.output = Path(args.output)
        self.persist()

    def persist(self):
        save(self.output / 'execution.json', self.journal)
        lines = ['## Backend production', '', f'- Transaction: `{self.transaction}`',
                 f'- Target: `{self.target}`', f'- Status: **{self.journal["status"]}**', '',
                 '| VPS | Completed actions | Rollback |', '| --- | --- | --- |']
        for role in ROLES:
            actions = ', '.join(self.journal['hosts'].get(role, {})) or '—'
            lines.append(f'| {role} | {actions} | {self.journal["rollback"].get(role, "—")} |')
        if self.journal.get('unlock_pending'):
            lines += ['', 'Lock cleanup pending: ' + ', '.join(self.journal['unlock_pending'])]
        (self.output / 'summary.md').write_text('\n'.join(lines) + '\n')

    def ssh_run(self, role, command, data=None, label='remote command'):
        print(f'[{role}] SSH start: {label}', flush=True)
        try:
            # Keep stdout for the JSON protocol; remote stderr streams redacted diagnostics live.
            result = subprocess.run([*self.ssh, '-i', self.identities[role], self.targets[role], command], input=data,
                                    stdout=subprocess.PIPE, timeout=1800)
        except subprocess.TimeoutExpired as error:
            print(f'[{role}] SSH failed: {label} timed out after 1800 seconds', flush=True)
            raise RuntimeError(f'{role}: {label} timed out') from error
        except OSError as error:
            print(f'[{role}] SSH could not start: {label} ({error.__class__.__name__})', flush=True)
            raise RuntimeError(f'{role}: could not start SSH for {label}') from error
        if result.returncode:
            print(f'[{role}] SSH failed: {label} (exit {result.returncode})', flush=True)
            raise RuntimeError(f'{role}: {label} failed (SSH exit {result.returncode}); see remote diagnostics above')
        print(f'[{role}] SSH complete: {label}', flush=True)
        return result.stdout

    def remote(self, role, action, target=None):
        release_id = target or self.target
        command = shlex.join(['python3', '-u', f'{ROOT}/releases/{release_id}/host.py',
                              action, role, release_id, self.transaction])
        response = json.loads(self.ssh_run(role, command, label=f'{action} release {release_id}'))
        self.journal['hosts'].setdefault(role, {})[action] = response
        self.persist()
        print(f'{role}: {action} completed', flush=True)
        return response

    def bundle(self):
        if not re.fullmatch(r'[a-f0-9]{40}', self.args.commit or '') or not re.fullmatch(r'[a-f0-9]{40,64}', self.args.tree or ''):
            raise ValueError('Full commit and tree SHA are required')
        evidence = json.loads(Path(self.args.evidence).read_text())
        if evidence.get('tree_sha') != self.args.tree:
            raise ValueError('CI evidence does not match the deployment tree')
        domain = self.args.domain
        if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', domain) or '.' not in domain:
            raise ValueError('Invalid public API domain')
        files = {}
        for name in ('host.py', 'release_log.py', 'services.json', 'compose.production.yml', 'nginx/nginx.conf', 'nginx/handygo.conf'):
            content = (HERE / name).read_bytes()
            if name == 'nginx/handygo.conf':
                content = content.replace(b'API_DOMAIN', domain.encode())
            files[name] = content
        registry = json.loads(files['services.json'])['services']
        selected = {name: item for name, item in registry.items() if item['deploy'] and item['state'] != 'NOT_READY'}
        if not selected:
            raise ValueError('Empty approved deployment scope')
        if any(item['deploy'] and item['state'] == 'NOT_READY' for item in registry.values()):
            raise ValueError('NOT_READY services cannot deploy')
        hosts = {role: sorted(name for name, item in selected.items() if item['host'] == role) for role in ROLES}
        hosts['vps1'].append('nginx')
        shared_env = Path(self.args.env_file).read_bytes()
        # Validate without emitting secrets; same rules as the VPS executor.
        import importlib.util
        spec = importlib.util.spec_from_file_location('release_host', HERE / 'host.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for image in (self.args.app_image, self.args.migration_image, self.args.nginx_image):
            if not re.fullmatch(module.DIGEST, image or ''):
                raise ValueError('Only digest image references are accepted')
        module.validate_env(Path(self.args.env_file))
        migrations = sorted((HERE.parents[1] / 'apps').glob('*/prisma/migrations/**/migration.sql'))
        migration_bytes = b''.join(str(p.relative_to(HERE.parents[1])).encode() + b'\0' + p.read_bytes() for p in migrations)
        manifest = {
            'schema_version': 1, 'release_id': self.target, 'commit_sha': self.args.commit, 'domain': domain,
            'tree_sha': self.args.tree, 'run_id': self.args.run_id, 'run_attempt': self.args.attempt,
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'ci_evidence': evidence,
            'app_image': self.args.app_image, 'migration_image': self.args.migration_image,
            'nginx_image': self.args.nginx_image, 'platform': 'linux/amd64',
            'config_sha256': digest(shared_env), 'migration_hash': digest(migration_bytes),
            'run_migrations': self.args.run_migrations,
            'rollback_compatible': True,
            'hosts': hosts, 'services': selected,
            'images': {name: self.args.app_image for name in selected} | {'nginx': self.args.nginx_image},
            'excluded': {n: 'Disabled or NOT_READY' for n in registry if n not in selected},
            'memory_mib': {role: sum(s['memory_mib'] for s in selected.values() if s['host'] == role)
                           + (32 if role == 'vps1' else 0) for role in ROLES},
            'files': {name: digest(content) for name, content in files.items()},
            'verification_scope': 'Health for all; SQL/consumer/catalog/network probes for implemented features. Not full business acceptance.',
        }
        save(self.output / 'manifest.json', manifest)
        files['manifest.json'] = json.dumps(manifest, indent=2).encode()
        files['shared.env'] = shared_env
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as archive:
            for name, content in files.items():
                info = tarfile.TarInfo(name)
                info.size, info.mode = len(content), 0o600
                archive.addfile(info, io.BytesIO(content))
        return manifest, stream.getvalue()

    def execute(self):
        participants = []
        emit('deploy', f'{self.journal.get("operation", "deploy")} transaction {self.transaction}; target {self.target}')
        try:
            if self.args.rollback_release:
                manifests = []
                for role in ROLES:
                    manifests.append(json.loads(self.ssh_run(
                        role, shlex.join(['cat', f'{ROOT}/releases/{self.target}/manifest.json']),
                        label=f'load rollback manifest {self.target}')))
                if any(m != manifests[0] for m in manifests):
                    raise RuntimeError('Rollback bundle manifests differ between hosts')
                manifest = manifests[0]
                if not manifest.get('rollback_compatible'):
                    raise RuntimeError('Target cannot be rolled back automatically')
                save(self.output / 'manifest.json', manifest)
            else:
                manifest, archive = self.bundle()
                for role in ROLES:
                    directory = f'{ROOT}/releases/{self.target}'
                    # mkdir without -p: a release is immutable, retries use a new run attempt.
                    self.ssh_run(role, f'umask 077 && mkdir {shlex.quote(directory)} && tar -xzf - -C {shlex.quote(directory)}',
                                 archive, label=f'stage release bundle {self.target}')
            for role in ROLES:
                # An uncertain SSH result may have acquired the lock. Include it BEFORE calling begin.
                participants.append(role)
                snapshot = self.remote(role, 'begin')
                previous = snapshot['previous']
                if self.args.rollback_release and not previous:
                    raise RuntimeError('Cannot rollback an uninitialized host')
                if self.args.rollback_release and snapshot['migration_hash'] != manifest['migration_hash']:
                    raise RuntimeError('Migration histories differ; manual compatibility review required')
                if not self.args.rollback_release and snapshot['migration_hash'] != manifest['migration_hash'] and not self.args.run_migrations:
                    raise RuntimeError('New/initial migrations require an explicitly reviewed run_migrations deployment')
            previous_ids = [self.journal['hosts'][r]['begin']['previous'] for r in ROLES]
            if any(value != previous_ids[0] for value in previous_ids):
                raise RuntimeError('Hosts disagree on stable release; reconcile before deploying')
            for role in ROLES:
                self.remote(role, 'prepare')
            self.journal['status'] = 'DEPLOYING'
            self.persist()
            for role in ROLES:
                self.remote(role, 'apply')
            for role in ROLES:
                self.remote(role, 'verify')
            self.public_smoke(manifest)
            time.sleep(20)
            for role in ROLES:
                self.remote(role, 'verify')
            for role in ROLES:
                self.remote(role, 'commit')
            # Persist success before unlock. A failed unlock never initiates a second rollout.
            self.journal['status'] = 'STABLE'
            self.persist()
        except (Exception, KeyboardInterrupt) as error:
            emit('deploy', f'FAILED: {type(error).__name__}: {error}; starting compensation')
            self.journal['error'] = redact(error)
            self.journal['status'] = 'FAILED'
            self.persist()
            if not participants:
                self.journal['status'] = 'FAILED_BEFORE_ROLLOUT'
                self.persist()
                raise RuntimeError('FAILED_BEFORE_ROLLOUT; no host transaction was started') from error
            restored = {}
            for role in reversed(participants):
                try:
                    restored[role] = self.remote(role, 'restore')
                    self.journal['rollback'][role] = restored[role]['rollback']
                except Exception as rollback_error:
                    emit(role, f'FAILED restore: {rollback_error}')
                    self.journal['rollback'][role] = 'FAILED_OR_UNREACHABLE'
            verified = True
            for role, result in restored.items():
                if result['rollback'] == 'RESTORED':
                    try:
                        self.remote(role, 'verify', result['release_id'])
                    except Exception as verify_error:
                        emit(role, f'FAILED rollback verification: {verify_error}')
                        verified = False
                        self.journal['rollback'][role] = 'VERIFY_FAILED'
                elif result['rollback'] != 'NOT_NEEDED':
                    verified = False
            success = verified and len(restored) == len(participants) and bool(participants)
            if success and any(r['rollback'] == 'RESTORED' for r in restored.values()):
                try:
                    old = next(self.journal['hosts'][role]['begin']['previous_manifest']
                               for role in restored if restored[role]['rollback'] == 'RESTORED')
                    self.public_smoke(old)
                except Exception as smoke_error:
                    emit('deploy', f'FAILED rollback public smoke: {smoke_error}')
                    success = False
            self.journal['status'] = 'FAILED_ROLLBACK_SUCCESS' if success else 'FAILED_NEEDS_INTERVENTION'
            self.persist()
            emit('deploy', self.journal['status'])
            if success:
                self.unlock(participants)
            raise RuntimeError(self.journal['status']) from error
        self.unlock(participants)

    def unlock(self, participants):
        failures = []
        for role in participants:
            try:
                self.remote(role, 'finish')
            except Exception as error:
                emit(role, f'FAILED finish: {error}')
                failures.append(role)
        if failures:
            self.journal['unlock_pending'] = failures
            self.persist()
            raise RuntimeError('Release state recorded, but lock cleanup requires intervention')

    def public_smoke(self, manifest):
        domain = manifest.get('domain', self.args.domain)
        if not domain:
            raise ValueError('API domain is required for HTTPS verification')
        # No redirects, no disabling TLS verification. Test public edge and a real DB-backed API.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(NoRedirect)
        for path in ('/health', '/api/v1/categories'):
            emit('deploy', f'Public HTTPS probe: {path}')
            with opener.open(f'https://{domain}{path}', timeout=15) as response:
                if response.status != 200:
                    raise RuntimeError('Public HTTPS smoke failed')
                data = json.load(response)
                if path.endswith('categories') and 'data' not in data:
                    raise RuntimeError('Catalog smoke failed')
        self.journal['public_smoke'] = 'PASSED'
        self.persist()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run-id', required=True, type=int)
    parser.add_argument('--attempt', required=True, type=int)
    parser.add_argument('--rollback-release', default='')
    parser.add_argument('--domain', required=True)
    parser.add_argument('--env-file')
    parser.add_argument('--app-image')
    parser.add_argument('--migration-image')
    parser.add_argument('--nginx-image')
    parser.add_argument('--commit')
    parser.add_argument('--tree')
    parser.add_argument('--evidence')
    parser.add_argument('--run-migrations', action='store_true')
    parser.add_argument('--output', default='release-output')
    args = parser.parse_args()
    if args.rollback_release and args.run_migrations:
        parser.error('Rollback never runs database migrations')
    if not args.rollback_release and any(not getattr(args, key) for key in (
            'env_file', 'app_image', 'migration_image', 'nginx_image', 'commit', 'tree', 'evidence')):
        parser.error('Deploy requires ENV, image digests, commit/tree and CI evidence')
    Coordinator(args).execute()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('deploy', f'{type(error).__name__}: {error}')
        print('::error::Backend production failed; see VPS/action diagnostics and the release artifact.', flush=True)
        raise SystemExit(1)
