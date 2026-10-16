#!/usr/bin/env python3
"""One-host release executor. Stdlib only; called over SSH by orchestrate.py."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import shlex
import subprocess
import sys

from release_log import emit, load_secrets, redact

ROOT = Path('/opt/handygo')
RELEASE_ID = r'prod-[0-9]{8}-[0-9]+-a[0-9]+'
DIGEST = r'(?:ghcr\.io/[a-z0-9._/-]+|nginx)@sha256:[a-f0-9]{64}'
ROLES = ('vps1', 'vps2', 'vps3')


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def write(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


def run(argv, env=None, label=None):
    label = label or shlex.join(argv[:2])
    emit('host', f'Start: {label}')
    try:
        result = subprocess.run(argv, env=env, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired as error:
        emit('host', f'Timeout after 600s: {label}')
        raise RuntimeError(f'Command timed out: {label}') from error
    if result.returncode:
        for output in (result.stdout, result.stderr):
            emit('host', '\n'.join(output.splitlines()[-40:]))
        raise RuntimeError(f'Command failed: {label} (exit {result.returncode})')
    emit('host', f'Complete: {label}')
    return result.stdout.strip()


def validate_env(path):
    values = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or key in values:
            raise ValueError('Invalid or duplicate key in shared ENV')
        if value.startswith(('"', "'")) or 'REPLACE_' in value or '\r' in line:
            raise ValueError('ENV requires literal, unquoted values and real configuration')
        if not value:
            raise ValueError(f'Empty ENV value: {key}')
        values[key] = value
    required = ('DATABASE_URL', 'DATABASE_URL_AUTH', 'DATABASE_URL_USER_TRUST',
                'RABBITMQ_URL', 'REDIS_URL', 'OTP_SECRET', 'INTERNAL_SERVICE_SECRET',
                'JWT_PUBLIC_KEY', 'JWT_PRIVATE_KEY', 'SMTP_USER', 'SMTP_PASS',
                'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
    if any(not values.get(key) for key in required) or values.get('NODE_ENV') != 'production':
        raise ValueError('Missing required production configuration')
    if not values['RABBITMQ_URL'].startswith('amqps://') or not values['REDIS_URL'].startswith('rediss://'):
        raise ValueError('Cloud RabbitMQ and Redis must use TLS')
    if any(len(values[key]) < 32 for key in ('OTP_SECRET', 'INTERNAL_SERVICE_SECRET')):
        raise ValueError('Application secrets must have at least 32 characters')
    return values


class Host:
    def __init__(self, role, release_id):
        if role not in ROLES or not re.fullmatch(RELEASE_ID, release_id):
            raise ValueError('Invalid role or release ID')
        self.role, self.release_id = role, release_id
        self.bundle = ROOT / 'releases' / release_id
        load_secrets(self.bundle / 'shared.env')
        # Failed rollouts can leave old containers running with the previous ENV.
        snapshots = [read(ROOT / 'stable.json'), (read(ROOT / 'pending.json') or {}).get('previous')]
        for snapshot in snapshots:
            if snapshot and re.fullmatch(RELEASE_ID, snapshot.get('release_id', '')):
                load_secrets(ROOT / 'releases' / snapshot['release_id'] / 'shared.env')
        self.manifest = read(self.bundle / 'manifest.json')
        if self.manifest['release_id'] != release_id:
            raise ValueError('Manifest identity mismatch')
        if self.manifest.get('schema_version') != 1:
            raise ValueError('Unsupported release schema')
        self.names = self.manifest['hosts'][role]
        if len(self.names) != len(set(self.names)) or any(not re.fullmatch(r'[a-z][a-z0-9-]+', n) for n in self.names):
            raise ValueError('Invalid service set')
        self.metadata = read(ROOT / 'host.json')
        if self.metadata['role'] != role:
            raise ValueError('Host identity mismatch')
        if self.metadata['private_ip'] != {'vps1': '10.77.0.1', 'vps2': '10.77.0.2', 'vps3': '10.77.0.3'}[role]:
            raise ValueError('Unexpected WireGuard IP; update the topology consistently before deployment')
        for key in ('app_image', 'migration_image', 'nginx_image'):
            if not re.fullmatch(DIGEST, self.manifest[key]):
                raise ValueError('Only digest references are accepted')
        self.env = {**os.environ, 'APP_IMAGE': self.manifest['app_image'],
                    'NGINX_IMAGE': self.manifest['nginx_image'], 'APP_ENV_FILE': str(self.bundle / 'shared.env'),
                    'PRIVATE_IP': self.metadata['private_ip'], 'COMPOSE_PROFILES': ''}
        self.command = ['docker', 'compose', '--project-name', 'handygo', '--env-file', '/dev/null',
                        '-f', str(self.bundle / 'compose.production.yml'), '--profile', role]

    def compose(self, *args):
        return run([*self.command, *args], self.env, label=f'{self.role} compose {shlex.join(args)}')

    def owner(self, transaction):
        state = read(ROOT / 'pending.json')
        if not state or state['transaction'] != transaction or state['target'] != self.release_id:
            raise RuntimeError('No matching transaction; reconcile pending.json before retry')
        return state

    def begin(self, transaction):
        if (ROOT / 'pending.json').exists():
            raise RuntimeError('Unfinished transaction exists; do not deploy until reconciled')
        stable = read(ROOT / 'stable.json')
        if stable:
            if not re.fullmatch(RELEASE_ID, stable['release_id']):
                raise RuntimeError('Invalid previous stable ID')
            previous = read(ROOT / 'releases' / stable['release_id'] / 'manifest.json')
            if previous is None:
                raise RuntimeError('Previous stable bundle missing')
        else:
            existing = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=handygo'])
            if existing:
                raise RuntimeError('Unmanaged handygo containers exist; explicit migration/adoption required')
        write(ROOT / 'pending.json', {'transaction': transaction, 'previous': stable,
                                     'target': self.release_id, 'touched': False, 'phase': 'SNAPSHOT'})
        return {'previous': stable, 'previous_manifest': previous if stable else None,
                'migration_hash': previous['migration_hash'] if stable else None}

    def validate_bundle(self):
        path = self.bundle / 'shared.env'
        path.chmod(0o600)
        validate_env(path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != self.manifest['config_sha256']:
            raise ValueError('Shared ENV fingerprint mismatch')
        for name, digest in self.manifest['files'].items():
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Invalid bundle path')
            if hashlib.sha256((self.bundle / relative).read_bytes()).hexdigest() != digest:
                raise ValueError(f'Bundle checksum mismatch: {name}')

    def prepare(self, transaction):
        self.owner(transaction)
        self.validate_bundle()
        version = run(['docker', 'compose', 'version', '--short'])
        match = re.match(r'v?(\d+)\.(\d+)', version)
        if not match or tuple(map(int, match.groups())) < (2, 30):
            raise RuntimeError('Docker Compose >= 2.30 is required for shared raw ENV')
        addresses = run(['ip', '-4', '-o', 'addr', 'show', 'dev', 'wg0'])
        if self.metadata['private_ip'] not in re.findall(r'\binet ([0-9.]+)/', addresses):
            raise RuntimeError('Expected WireGuard IP is not present on wg0')
        if run(['uname', '-m']) != 'x86_64':
            raise RuntimeError('This release requires an amd64/x86_64 VPS')
        if self.role == 'vps1':
            for filename in ('fullchain.pem', 'privkey.pem'):
                if not (ROOT / 'tls' / filename).is_file():
                    raise RuntimeError(f'TLS file missing: {ROOT / "tls" / filename}; '
                                       'provision HTTPS on VPS1 before the first deploy (README section 7)')
        memory = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemTotal:'))) // 1024
        if memory < self.manifest['memory_mib'][self.role] + 280:
            raise RuntimeError('Insufficient host RAM including OS reserve')
        if shutil.disk_usage(ROOT).free < 2 * 1024 ** 3:
            raise RuntimeError('At least 2 GiB free disk is required before pulling a release')
        self.compose('config', '--quiet')
        self.compose('pull', *self.names)
        if self.manifest['run_migrations'] and self.release_id == transaction:
            run(['docker', 'pull', self.manifest['migration_image']])
        return {'prepared': True}

    def apply(self, transaction):
        state = self.owner(transaction)
        state.update(touched=True, phase='APPLYING')
        write(ROOT / 'pending.json', state)  # before mutation, including uncertain SSH outcomes
        migrations = {'vps1': ('user-trust', 'auth'), 'vps2': (), 'vps3': ('catalog',)}[self.role]
        if self.manifest['run_migrations'] and migrations and self.release_id == transaction:
            self.compose('stop', *self.names)
            for service in migrations:
                run(['docker', 'run', '--rm', '--memory=384m', '--memory-swap=384m',
                     '--pids-limit=100', '--cap-drop=ALL', '--security-opt=no-new-privileges',
                     '--env-file', str(self.bundle / 'shared.env'), '-e', 'NODE_OPTIONS=--max-old-space-size=192',
                     self.manifest['migration_image'], 'pnpm', 'run', f'prisma:migrate:{service}'],
                    label=f'{self.role} migrate {service}')
        order = sorted(self.names, key=lambda n: {'user-trust-service': -3, 'auth-service': -2,
                                                'api-gateway': 1, 'nginx': 2}.get(n, 0))
        for name in order:
            self.compose('up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '240', name)
        old = state['previous']
        if old:
            old_host = Host(self.role, old['release_id'])
            obsolete = sorted(set(old_host.names) - set(self.names))
            if obsolete:
                old_host.compose('rm', '-s', '-f', *obsolete)
        self.verify()
        state['phase'] = 'VERIFIED'
        write(ROOT / 'pending.json', state)
        return {'verified': True}

    def verify(self):
        observations = {}
        for name in self.names:
            emit(self.role, f'Verify service: {name}')
            container = self.compose('ps', '-q', name)
            if not container or '\n' in container:
                raise RuntimeError(f'Missing or duplicate container: {name}')
            data = json.loads(run(['docker', 'inspect', '--format', '{{json .State}}', container]))
            if not data.get('Running') or data.get('OOMKilled') or data.get('Health', {}).get('Status') != 'healthy':
                raise RuntimeError(f'Container not healthy: {name}')
            expected_image = self.manifest['nginx_image' if name == 'nginx' else 'app_image']
            expected_id = run(['docker', 'image', 'inspect', '--format', '{{.Id}}', expected_image])
            actual_id = run(['docker', 'inspect', '--format', '{{.Image}}', container])
            if actual_id != expected_id:
                raise RuntimeError(f'Image mismatch: {name}')
            if int(run(['docker', 'inspect', '--format', '{{.RestartCount}}', container])):
                raise RuntimeError(f'Container has restarted; inspect before accepting release: {name}')
            if name != 'nginx' and self.manifest['services'][name]['scope'] != 'health-only':
                run(['docker', 'exec', container, 'node', 'ops/verify.mjs', name])
            observations[name] = {'health': 'healthy', 'image': expected_image,
                                  'scope': 'edge' if name == 'nginx' else self.manifest['services'][name]['scope']}
        return {'verified': True, 'services': observations}

    def commit(self, transaction):
        state = self.owner(transaction)
        if state['phase'] != 'VERIFIED':
            raise RuntimeError('Cannot commit unverified host')
        write(ROOT / 'stable.json', {'release_id': self.release_id})
        state['phase'] = 'COMMITTED'
        write(ROOT / 'pending.json', state)
        return {'committed': True}

    def restore(self, transaction):
        state = self.owner(transaction)
        if not state['touched']:
            return {'rollback': 'NOT_NEEDED'}
        if not state['previous']:
            # No fake success on first deployment. Stop only this transaction's containers.
            self.compose('stop', *self.names)
            stable = read(ROOT / 'stable.json')
            if stable and stable['release_id'] == self.release_id:
                (ROOT / 'stable.json').unlink()
            state['phase'] = 'BOOTSTRAP_FAILED'
            write(ROOT / 'pending.json', state)
            return {'rollback': 'NO_PREVIOUS_RELEASE'}
        old = Host(self.role, state['previous']['release_id'])
        old.validate_bundle()
        old.compose('config', '--quiet')
        # Pull may fail during registry outage; local digest cache remains usable.
        for name in old.names:
            old.compose('up', '-d', '--no-build', '--no-deps', '--pull', 'missing', '--wait', '--wait-timeout', '240', name)
        added = sorted(set(self.names) - set(old.names))
        if added:
            self.compose('rm', '-s', '-f', *added)
        # Global connectivity is verified after ALL hosts restore.
        write(ROOT / 'stable.json', state['previous'])
        state['phase'] = 'RESTORED'
        write(ROOT / 'pending.json', state)
        return {'rollback': 'RESTORED', 'release_id': old.release_id}

    def diagnostics(self):
        # State only, never Config.Env/compose config. Keep probes bounded so rollback can proceed.
        for name in self.names:
            try:
                result = subprocess.run([*self.command, 'ps', '-aq', name], env=self.env,
                                        capture_output=True, text=True, timeout=10)
                for container in result.stdout.splitlines():
                    if not re.fullmatch(r'[a-f0-9]{12,64}', container):
                        continue
                    for args in (['inspect', '--format', '{{json .State}}', container],
                                 ['logs', '--since', '10m', '--tail', '40', container]):
                        result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=10)
                        emit(self.role, f'Diagnostics {name} / {args[0]}:')
                        emit(self.role, '\n'.join((result.stdout + result.stderr).splitlines()[-40:]))
            except Exception as error:
                emit(self.role, f'Diagnostics unavailable for {name}: {type(error).__name__}')

    def finish(self, transaction):
        state = self.owner(transaction)
        if state['phase'] not in ('SNAPSHOT', 'COMMITTED', 'RESTORED'):
            raise RuntimeError('Transaction is not safe to unlock')
        (ROOT / 'pending.json').unlink()
        return {'unlocked': True}


def main():
    os.umask(0o077)
    action, role, release_id, transaction = sys.argv[1:]
    if not re.fullmatch(RELEASE_ID, transaction):
        raise ValueError('Invalid transaction ID')
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        host = Host(role, release_id)
        emit(role, f'Start {action}: {release_id}')
        try:
            if action == 'verify':
                result = host.verify()
            elif action in ('begin', 'prepare', 'apply', 'commit', 'restore', 'finish'):
                result = getattr(host, action)(transaction)
            else:
                raise ValueError('Unknown host action')
        except Exception as error:
            emit(role, f'FAILED {action}: {type(error).__name__}: {error}')
            if action in ('apply', 'verify', 'restore'):
                host.diagnostics()
            raise
        emit(role, f'Complete {action}: {release_id}')
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('host', f'{type(error).__name__}: {redact(error)}')
        sys.exit(1)
