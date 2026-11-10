#!/usr/bin/env python3
"""Runner coordinator: stage all hosts, roll out serially, compensate every participant."""
import argparse
import base64
from contextlib import contextmanager
import select
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
import uuid
import urllib.request

from release_log import emit, load_secrets, redact

HERE = Path(__file__).resolve().parent
ROLES = ('vps4', 'vps3', 'vps2', 'vps1')
ROOT = '/opt/handygo'
ID = r'prod-[0-9]{8}-[0-9]+-a[0-9]+'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    from host import write
    write(path, data)


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

    def ssh_run(self, role, command, data=None, label='remote command', timeout=1800):
        lock = getattr(self, 'lock_process', None)
        if lock is not None and lock.poll() is not None:
            raise RuntimeError('Cluster lock session lost; coordinator fenced')
        deadline = getattr(self, 'rollout_deadline', None)
        if deadline is not None and time.monotonic() >= deadline:
            raise RuntimeError('Rollout deadline reached; starting rollback with reserved job time')
        print(f'[{role}] SSH start: {label}', flush=True)
        try:
            # Keep stdout for the JSON protocol; remote stderr streams redacted diagnostics live.
            result = subprocess.run([*self.ssh, '-i', self.identities[role], self.targets[role], command], input=data,
                                    stdout=subprocess.PIPE, timeout=timeout)
        except subprocess.TimeoutExpired as error:
            print(f'[{role}] SSH failed: {label} timed out after {timeout} seconds', flush=True)
            raise RuntimeError(f'{role}: {label} timed out') from error
        except OSError as error:
            print(f'[{role}] SSH could not start: {label} ({error.__class__.__name__})', flush=True)
            raise RuntimeError(f'{role}: could not start SSH for {label}') from error
        if result.returncode:
            print(f'[{role}] SSH failed: {label} (exit {result.returncode})', flush=True)
            raise RuntimeError(f'{role}: {label} failed (SSH exit {result.returncode}); see remote diagnostics above')
        print(f'[{role}] SSH complete: {label}', flush=True)
        return result.stdout

    @contextmanager
    def cluster_lock(self):
        """Session lock, never a TTL. All supported entry points use VPS3 first."""
        role = 'vps3'
        script = f"""import fcntl,json,os,sys,tempfile
from pathlib import Path
root=Path({ROOT!r})
f=open(root/'cluster.lock','a')
fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
path=root/'cluster-epoch.json'
epoch=json.loads(path.read_text())+1 if path.exists() else 1
fd,name=tempfile.mkstemp(prefix='.epoch-',dir=root)
with os.fdopen(fd,'w') as stream:
    stream.write(json.dumps(epoch)); stream.flush(); os.fsync(stream.fileno())
os.replace(name,path)
directory=os.open(root,os.O_RDONLY); os.fsync(directory); os.close(directory)
print('LOCKED:'+str(epoch),flush=True)
sys.stdin.read()
"""
        process = subprocess.Popen([*self.ssh, '-i', self.identities[role], self.targets[role],
                                    shlex.join(['python3', '-u', '-c', script])],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        try:
            ready, _, _ = select.select([process.stdout], [], [], 30)
            reply = process.stdout.readline().decode().strip() if ready else ''
            if not re.fullmatch(r'LOCKED:[1-9][0-9]*', reply):
                raise RuntimeError('RECOVERY_REQUIRED: cluster lock unavailable; another coordinator may be active')
            self.lock_process = process
            self.inspect_cluster()  # fail closed before changing any host fencing metadata
            self.fence = reply.split(':')[1] + ':' + uuid.uuid4().hex
            for host_role in ROLES:
                self.executor(host_role, 'claim-fence')
            yield
        finally:
            self.lock_process = None
            process.stdin.close()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=10)

    def executor(self, role, action, target=None, wait_lock=True):
        # Execute reviewed runner code, never host.py from an old release/artifact.
        sources = {name: (HERE / name).read_text() for name in ('host.py', 'release_log.py', 'services.json')}
        loader = ('import base64,json,sys,types; '
                  's=json.loads(base64.b64decode(sys.argv[1])); '
                  'm=types.ModuleType("release_log"); exec(s["release_log.py"],m.__dict__); '
                  'sys.modules["release_log"]=m; '
                  'd=types.ModuleType("deployment_services"); d.REGISTRY=json.loads(s["services.json"])["services"]; '
                  'sys.modules["deployment_services"]=d; sys.argv=sys.argv[1:]; '
                  'exec(compile(s["host.py"],"trusted-host.py","exec"),{"__name__":"__main__"})')
        payload = base64.b64encode(json.dumps(sources).encode()).decode()
        command = ['python3', '-u', '-c', loader, payload, action, role,
                   target or self.target, self.transaction]
        if action != 'inspect':
            command += ['--expected-state', self.states[role]['token']]
            if getattr(self, 'fence', None):
                command += ['--fence', self.fence]
        if wait_lock:
            command.append('--wait-lock')
        response = json.loads(self.ssh_run(role, shlex.join(command),
                              label=f'{action} release {target or self.target}', timeout=3600))
        if action == 'inspect':
            return response
        self.states[role] = response.pop('_state')
        return response

    def inspect_cluster(self):
        # Complete all read-only inspection before any bundle staging or mutation.
        states, errors = {}, {}
        for role in ROLES:
            try:
                states[role] = self.executor(role, 'inspect')
            except Exception as error:
                errors[role] = redact(error)
        if errors:
            self.journal['inspection_errors'] = errors
            self.persist()
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: cluster inspection failed; no mutation allowed')
        self.states = states
        return states

    def remote(self, role, action, target=None, wait_lock=False):
        response = self.executor(role, action, target, wait_lock=True)
        self.journal['hosts'].setdefault(role, {})[action] = response
        self.persist()
        return response

    def preflight(self):
        from recovery import reconcile
        original = self.transaction, self.target
        try:
            for _ in range(len(ROLES) + 1):
                reconcile(self, automatic=True)
                if not any(state['pending'] for state in self.inspect_cluster().values()):
                    break
            else:
                raise RuntimeError('RECOVERY_REQUIRED: bounded reconciliation did not finish')
        finally:
            self.transaction, self.target = original
        self.journal.update(transaction=self.transaction, target_release=self.target)
        self.persist()

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
        values = module.validate_env(Path(self.args.env_file))
        module.validate_service_endpoints(values, registry)
        from database_plan import validate_database_plan, validate_migration_owners
        validate_migration_owners(HERE.parents[1], registry, module.MIGRATIONS)
        database_budget = validate_database_plan(values, registry, run_migrations=self.args.run_migrations)
        migrations = sorted((HERE.parents[1] / 'apps').glob('*/prisma/migrations/**/migration.sql'))
        migration_bytes = b''.join(str(p.relative_to(HERE.parents[1])).encode() + b'\0' + p.read_bytes() for p in migrations)
        # A newly enabled migration owner must require review even when SQL is unchanged.
        migration_bytes += b'\0owners\0' + json.dumps(module.MIGRATIONS, sort_keys=True).encode()
        manifest = {
            'schema_version': 1, 'container_verification_version': 1, 'release_id': self.target, 'commit_sha': self.args.commit, 'domain': domain,
            'tree_sha': self.args.tree, 'run_id': self.args.run_id, 'run_attempt': self.args.attempt,
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'ci_evidence': evidence,
            'app_image': self.args.app_image, 'migration_image': self.args.migration_image,
            'nginx_image': self.args.nginx_image, 'platform': 'linux/amd64',
            'config_sha256': digest(shared_env), 'migration_hash': digest(migration_bytes),
            'database_budget': database_budget,
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
        with self.cluster_lock():
            self.preflight()
            self._execute()

    def _execute(self):
        participants = []
        attempted = []
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
                attempted.append(role)
                self.journal.setdefault('ownership', {})[role] = 'BEGIN_OUTCOME_UNKNOWN'
                snapshot = self.remote(role, 'begin')
                participants.append(role)
                self.journal['ownership'][role] = 'BEGIN_CONFIRMED'
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
            self.rollout_deadline = None  # The forward budget must never prevent compensation.
            emit('deploy', f'FAILED: {type(error).__name__}: {error}; starting compensation')
            self.journal['error'] = redact(error)
            self.journal['status'] = 'FAILED'
            self.persist()
            if not attempted:
                self.journal['status'] = 'FAILED_BEFORE_ROLLOUT'
                self.persist()
                raise RuntimeError('FAILED_BEFORE_ROLLOUT; no host transaction was started') from error
            from recovery import reconcile
            try:
                # Re-read every host under lock: an SSH timeout is not proof of ownership.
                states = self.inspect_cluster()
                for role in attempted:
                    pending = states[role]['pending']
                    self.journal['ownership'][role] = (
                        'OWNED' if pending and pending['transaction'] == self.transaction
                        and pending['target'] == self.target else
                        'FOREIGN_OWNER' if pending else 'NO_JOURNAL')
                reconcile(self, expected=(self.transaction, self.target))
                if self.journal['status'] == 'STABLE':
                    self.journal['status'] = 'FAILED_COMMIT_RECOVERED'
                elif self.journal['status'] == 'RECOVERY_REQUIRED':
                    self.journal['status'] = 'FAILED_NEEDS_INTERVENTION'
                else:
                    self.journal['status'] = 'FAILED_ROLLBACK_SUCCESS'
            except Exception as recovery_error:
                self.journal['recovery_error'] = redact(recovery_error)
                self.journal['status'] = 'FAILED_NEEDS_INTERVENTION'
            self.persist()
            raise RuntimeError(self.journal['status']) from error
        self.unlock(participants)

    def unlock(self, participants):
        failures = []
        for role in participants:
            try:
                self.remote(role, 'authorize-finish')
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
