#!/usr/bin/env python3
"""One-host release executor. Stdlib only; called over SSH by orchestrate.py."""
import fcntl
import datetime
import ipaddress
from urllib.parse import urlsplit
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import shlex
import subprocess
import sys
import tempfile
import time

from release_log import emit, load_secrets, redact

ROOT = Path('/opt/handygo')
RELEASE_ID = r'prod-[0-9]{8}-[0-9]+-a[0-9]+'
DIGEST = r'(?:ghcr\.io/[a-z0-9._/-]+|nginx)@sha256:[a-f0-9]{64}'
ROLES = ('vps1', 'vps2', 'vps3')
# services.json is the single migration ownership/order source. Remote execution
# receives this registry from the reviewed release coordinator.
try:
    from deployment_services import REGISTRY as _SERVICE_REGISTRY
except ImportError:
    _SERVICE_REGISTRY = json.loads((Path(__file__).resolve().with_name('services.json')).read_text())['services']
MIGRATIONS = {
    role: tuple(item['migration'] for item in sorted(_SERVICE_REGISTRY.values(),
        key=lambda item: item.get('migration_order', 0))
        if item.get('migration') is not None and item.get('host') == role and item.get('deploy'))
    for role in ROLES
}
NGINX_PREFLIGHT = '''\
for directory in /etc/nginx/tls /var/www/certbot; do
    if [ ! -d "$directory" ] || [ ! -x "$directory" ]; then
        echo "Nginx preflight: directory not traversable: $directory" >&2
        exit 1
    fi
done
for file in /etc/nginx/nginx.conf /etc/nginx/conf.d/handygo.conf /etc/nginx/tls/fullchain.pem /etc/nginx/tls/privkey.pem; do
    if [ ! -f "$file" ] || [ ! -r "$file" ]; then
        echo "Nginx preflight: file missing or unreadable as $(id -u):$(id -g): $file" >&2
        exit 1
    fi
done
mode=$(stat -L -c %a /etc/nginx/tls/privkey.pem)
if [ "$((0$mode & 4))" -ne 0 ]; then
    echo "Nginx preflight: private key must not be world-readable" >&2
    exit 1
fi
exec nginx -t
'''


def read(path, default=None):
    try:
        return json.loads(path.read_text()) if path.exists() else default
    except (ValueError, UnicodeError) as error:
        raise RuntimeError('Corrupted deployment JSON; preserve state for operator inspection') from error


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def write(path, data):
    descriptor, filename = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    temporary = Path(filename)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(json.dumps(data, indent=2) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def state_token():
    state = {key: read(ROOT / (key + '.json')) for key in ('stable', 'pending', 'fence')}
    return hashlib.sha256(json.dumps(state, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def inspect_state(role):
    """Read and validate snapshots while deploy.lock is held; never print ENV."""
    metadata = read(ROOT / 'host.json')
    if role not in ROLES or not isinstance(metadata, dict) or metadata.get('role') != role:
        raise RuntimeError('Host identity mismatch')
    if metadata.get('private_ip') != {'vps1': '10.77.0.1', 'vps2': '10.77.0.2', 'vps3': '10.77.0.3'}[role]:
        raise RuntimeError('Unexpected WireGuard host identity')
    state = {key: read(ROOT / (key + '.json')) for key in ('stable', 'pending')}
    references = set()
    def snapshot(value):
        if not isinstance(value, dict) or not isinstance(value.get('release_id'), str) or not re.fullmatch(RELEASE_ID, value['release_id']):
            raise RuntimeError('Invalid release snapshot; preserve deployment state')
        references.add(value['release_id'])
    stable, pending = state['stable'], state['pending']
    if stable is not None:
        snapshot(stable)
    elif (ROOT / 'stable.json').exists():
        raise RuntimeError('Invalid stable journal')
    if pending is not None:
        if not isinstance(pending, dict) or any(not isinstance(pending.get(key), str) or not re.fullmatch(RELEASE_ID, pending[key]) for key in ('transaction', 'target')):
            raise RuntimeError('Invalid pending owner or target')
        if 'phase' not in pending and type(pending.get('touched')) is bool:
            pending['phase'] = 'APPLYING' if pending['touched'] else 'SNAPSHOT'
        if pending.get('phase') not in ('SNAPSHOT', 'APPLYING', 'VERIFIED', 'COMMITTED', 'RESTORED', 'BOOTSTRAP_FAILED') or type(pending.get('touched')) is not bool or 'previous' not in pending:
            raise RuntimeError('Invalid pending phase or snapshot')
        if (pending['phase'] == 'SNAPSHOT') != (not pending['touched']):
            raise RuntimeError('Inconsistent pending phase and touched flag')
        references.add(pending['target'])
        if pending['previous'] is not None:
            snapshot(pending['previous'])
        if stable not in (pending['previous'], {'release_id': pending['target']}):
            raise RuntimeError('Stable journal does not match transaction snapshots')
    elif (ROOT / 'pending.json').exists():
        raise RuntimeError('Invalid pending journal')
    manifests = {}
    for release_id in sorted(references):
        executor = Host(role, release_id)
        executor.validate_bundle()
        if not isinstance(executor.manifest.get('migration_hash'), str) or not executor.manifest['migration_hash']:
            raise RuntimeError('Missing migration metadata')
        manifests[release_id] = executor.manifest
    return {**state, 'role': role, 'manifests': manifests, 'token': state_token()}


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


def validate_service_endpoints(values, registry):
    """New release/ENV preflight only; do not invalidate immutable recovery bundles."""
    ips = {'vps1': '10.77.0.1', 'vps2': '10.77.0.2', 'vps3': '10.77.0.3'}
    for name, target in registry.items():
        key = target.get('url_env')
        if not key:
            continue
        callers = target.get('http_callers', [])
        if any(caller not in registry for caller in callers):
            raise ValueError(f'Invalid HTTP caller topology: {name}')
        if not callers:
            continue
        url = urlsplit(values.get(key, ''))
        cross_host = any(registry[caller]['host'] != target['host'] for caller in callers)
        allowed = {ips[target['host']]} if cross_host else {name} | ({ips[target['host']]} if target.get('wireguard_http') else set())
        if (url.scheme != 'http' or url.hostname not in allowed or url.port != target['port']
                or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment):
            raise ValueError(f'{key} must target the registered WireGuard IP/port or permitted same-host Docker DNS')
    ai = urlsplit(values.get('AI_SERVICE_URL', ''))
    hostname = ai.hostname or ''
    try:
        ipaddress.ip_address(hostname)
        is_ip = True
    except ValueError:
        is_ip = False
    if (ai.scheme != 'https' or is_ip or '.' not in hostname
            or hostname.endswith(('.localhost', '.local', '.internal')) or ai.username or ai.password
            or ai.path not in ('', '/') or ai.query or ai.fragment):
        raise ValueError('AI_SERVICE_URL must be the external HTTPS origin of the deployed AI service')


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
        values[key] = value
    required = ('DATABASE_URL', 'RABBITMQ_URL', 'REDIS_URL', 'OTP_SECRET', 'INTERNAL_SERVICE_SECRET',
                'JWT_PUBLIC_KEY', 'JWT_PRIVATE_KEY', 'SMTP_USER', 'SMTP_PASS',
                'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
    if any(not values.get(key, '').strip() for key in required) or values.get('NODE_ENV') != 'production':
        raise ValueError('Missing required production configuration')
    for key, value in values.items():
        if key == 'DATABASE_URL' or key.startswith(('DATABASE_URL_', 'DIRECT_URL_')):
            if not value.strip():
                continue
            try:
                url = urlsplit(value.strip())
                if (url.scheme not in ('postgres', 'postgresql') or not url.hostname
                        or not url.username or not url.path.strip('/') or not 1 <= (url.port if url.port is not None else 5432) <= 65535):
                    raise ValueError()
            except ValueError:
                raise ValueError(f'{key}: valid PostgreSQL endpoint required') from None
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
        if not isinstance(self.manifest, dict) or self.manifest.get('release_id') != release_id:
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

    def compose(self, *args, label=None):
        return run([*self.command, *args], self.env, label=label or f'{self.role} compose {shlex.join(args)}')

    def owner(self, transaction):
        state = read(ROOT / 'pending.json')
        if not isinstance(state, dict) or state.get('transaction') != transaction or state.get('target') != self.release_id:
            raise RuntimeError('No matching transaction; reconcile pending.json before retry')
        if 'phase' not in state and type(state.get('touched')) is bool:
            state['phase'] = 'APPLYING' if state['touched'] else 'SNAPSHOT'
        return state

    @staticmethod
    def _now():
        return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')

    def _container_snapshot(self, name):
        ids = self.compose('ps', '-aq', name).splitlines()
        if not ids:
            return None
        if len(ids) != 1 or not re.fullmatch(r'[a-f0-9]{12,64}', ids[0]):
            raise RuntimeError(f'Unexpected container identity for {name}')
        data = json.loads(run(['docker', 'inspect', '--format', '{{json .}}', ids[0]],
                              label=f'{self.role} inspect container identity {name}'))
        state = data.get('State', {})
        return {'id': data.get('Id'), 'image': data.get('Image'), 'created': data.get('Created'),
                'restart_count': data.get('RestartCount'), 'started_at': state.get('StartedAt'),
                'finished_at': state.get('FinishedAt'), 'exit_code': state.get('ExitCode'),
                'running': state.get('Running'), 'health': state.get('Health', {}).get('Status'), 'oom_killed': state.get('OOMKilled')}

    @staticmethod
    def _same_process(before, after):
        return bool(before and after and all(before.get(key) == after.get(key)
            for key in ('id', 'image', 'created', 'restart_count', 'started_at')))

    @staticmethod
    def _created_after(created, intent):
        try:
            def parse(value):
                return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
            return parse(created) >= parse(intent)
        except (AttributeError, TypeError, ValueError):
            return False

    def _capture_baseline(self):
        return {'version': 1, 'captured_at': self._now(), 'baseline': {
            name: self._container_snapshot(name) for name in self.names}}

    def _accept_container(self, name, before, after, intent, expected_id, *, force_new=False, historical_baseline=None):
        if not after or after.get('id') is None or after.get('image') != expected_id:
            raise RuntimeError(f'Container identity/image mismatch after rollout: {name}')
        if not after.get('running') or after.get('oom_killed') or after.get('health') != 'healthy':
            raise RuntimeError(f'Container is unhealthy after rollout: {name}')
        if force_new or not before or before.get('id') != after.get('id'):
            if after.get('restart_count') != 0 or not self._created_after(after.get('created'), intent):
                raise RuntimeError(f'Unexpected replacement or restart during rollout: {name}')
            classification = 'created_by_release'
        else:
            if not self._same_process(before, after):
                raise RuntimeError(f'Container restarted or changed during rollout: {name}')
            if after['restart_count']:
                if (not historical_baseline or not historical_baseline.get('running')
                        or historical_baseline.get('health') != 'healthy'
                        or historical_baseline.get('oom_killed')
                        or not self._same_process(historical_baseline, before)):
                    raise RuntimeError(f'Historical restart baseline was not healthy and stable: {name}')
                classification = 'historical_restart'
            else:
                classification = 'unchanged'
        return {'id': after['id'], 'image': after['image'], 'created': after['created'],
                'restart_count': after['restart_count'], 'started_at': after['started_at'],
                'finished_at': after.get('finished_at'), 'exit_code': after.get('exit_code'),
                'running': after.get('running'), 'health': after.get('health'),
                'oom_killed': after.get('oom_killed'),
                'baseline_restart_count': before.get('restart_count') if before else 0,
                'baseline_started_at': before.get('started_at') if before else None,
                'classification': classification, 'accepted_at': self._now()}

    def _transaction_evidence(self):
        pending = read(ROOT / 'pending.json')
        if isinstance(pending, dict):
            evidence = pending.get('container_evidence')
            if pending.get('target') == self.release_id and evidence:
                return evidence.get('accepted', {})
            previous = pending.get('previous') or {}
            if previous.get('release_id') == self.release_id and evidence:
                return evidence.get('restored', {})
        receipt = read(ROOT / 'transactions' / (self.release_id + '.json'))
        if isinstance(receipt, dict):
            evidence = receipt.get('container_evidence') or {}
            return evidence.get('accepted', {})
        raise RuntimeError('Container verification baseline missing; preserve transaction and reconcile')

    def _verify_bound_container(self, name, container, expected_id):
        accepted = self._transaction_evidence().get(name)
        current = self._container_snapshot(name)
        classification = accepted.get('classification') if accepted else None
        lifecycle_matches = bool(accepted and (
            classification == 'historical_restart'
            and accepted.get('restart_count', 0) > 0
            and accepted.get('baseline_restart_count') == accepted.get('restart_count')
            and accepted.get('baseline_started_at') == accepted.get('started_at')
            or classification in ('unchanged', 'created_by_release')
            and accepted.get('restart_count') == 0))
        if (not lifecycle_matches or not current or not current['id'].startswith(container)
                or current['id'] != accepted.get('id') or current['image'] != expected_id
                or current['image'] != accepted.get('image')
                or current['restart_count'] != accepted.get('restart_count')
                or current['started_at'] != accepted.get('started_at')
                or not current.get('running') or current.get('oom_killed')
                or current.get('health') != 'healthy'):
            raise RuntimeError(f'Container changed, restarted or became unhealthy after rollout: {name}')

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
        state = {'schema_version': 2, 'transaction': transaction, 'previous': stable,
                 'target': self.release_id, 'touched': False, 'phase': 'SNAPSHOT'}
        if self.manifest.get('container_verification_version') == 1:
            state['container_evidence'] = self._capture_baseline()
        write(ROOT / 'pending.json', state)
        return {'previous': stable, 'previous_manifest': previous if stable else None,
                'migration_hash': previous['migration_hash'] if stable else None}

    def validate_bundle(self):
        path = self.bundle / 'shared.env'
        validate_env(path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != self.manifest['config_sha256']:
            raise ValueError('Shared ENV fingerprint mismatch')
        for name, digest in self.manifest['files'].items():
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Invalid bundle path')
            if hashlib.sha256((self.bundle / relative).read_bytes()).hexdigest() != digest:
                raise ValueError(f'Bundle checksum mismatch: {name}')

    def check_memory(self):
        info = {}
        for line in Path('/proc/meminfo').read_text().splitlines():
            key, _, value = line.partition(':')
            if key in ('MemTotal', 'SwapTotal'):
                info[key] = int(value.split()[0]) // 1024
        memory, swap = info['MemTotal'], info.get('SwapTotal', 0)
        preflight = 128 if self.manifest.get('env_refresh') else 0
        required = self.manifest['memory_mib'][self.role] + 280 + preflight
        emit(self.role, f'Memory capacity: RAM={memory} MiB, active swap={swap} MiB, '
                        f'required={required} MiB including 280 MiB host reserve '
                        f'and {preflight} MiB candidate ENV preflight')
        if memory < 280:
            raise RuntimeError(f'Insufficient physical RAM for host reserve: {memory} MiB < 280 MiB')
        if memory + swap < required:
            raise RuntimeError(f'Insufficient host RAM + active swap: {memory} + {swap} MiB < {required} MiB; '
                               'enable swap before deployment')
        if memory < required:
            if run(['docker', 'info', '--format', '{{.SwapLimit}}']) != 'true':
                raise RuntimeError('Host requires swap but Docker swap limit support is unavailable')
            emit(self.role, 'Memory budget uses swap; disk paging can increase latency')
        return {'ram_mib': memory, 'swap_mib': swap, 'required_mib': required}

    def prepare_nginx_files(self):
        # Archives are deliberately 0600. Only these non-secret bind mounts need
        # to be readable by Nginx, which runs as a different UID from the deployer.
        for filename in ('nginx.conf', 'handygo.conf'):
            path = self.bundle / 'nginx' / filename
            if not path.is_file():
                raise RuntimeError(f'Nginx configuration missing: {path}')
            path.chmod(0o644)
        for filename in ('fullchain.pem', 'privkey.pem'):
            if not (ROOT / 'tls' / filename).is_file():
                raise RuntimeError(f'TLS file missing: {ROOT / "tls" / filename}; '
                                   'provision HTTPS on VPS1 before the first deploy (README section 7)')
        if not (ROOT / 'acme').is_dir():
            raise RuntimeError(f'ACME directory missing: {ROOT / "acme"}')

    def check_nginx(self):
        # Inspect resolved paths without printing Compose's application ENV.
        service = json.loads(self.compose('config', '--format', 'json'))['services']['nginx']
        if service.get('user') != '101:101' or service.get('image') != self.manifest['nginx_image']:
            raise RuntimeError('Unexpected Nginx image or UID:GID in Compose')
        expected = {
            '/etc/nginx/nginx.conf': self.bundle / 'nginx/nginx.conf',
            '/etc/nginx/conf.d/handygo.conf': self.bundle / 'nginx/handygo.conf',
            '/etc/nginx/tls': ROOT / 'tls',
            '/var/www/certbot': ROOT / 'acme',
        }
        mounts = service.get('volumes', [])
        if len(mounts) != len(expected) or any(
                mount.get('type') != 'bind' or not mount.get('read_only')
                or mount.get('source') != str(expected.get(mount.get('target'), ''))
                for mount in mounts) or {mount.get('target') for mount in mounts} != set(expected):
            raise RuntimeError('Unexpected Nginx bind mounts; expected release configs and host TLS/ACME read-only')
        # Inherit image, user, mounts, read-only rootfs, tmpfs, resource limits and
        # security settings. No dependencies or published ports; nginx -t exits.
        # The upstream uses runtime DNS, so api-gateway need not be running.
        # A live edge may already own the static IP. Reset only the one-off IP;
        # keep the production network and never modify the release Compose file.
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yml') as override:
            override.write('services:\n  nginx:\n    networks:\n      default:\n'
                           '        ipv4_address: !reset null\n')
            override.flush()
            self.compose('-f', override.name, 'run', '--rm', '--no-deps', '-T', '--pull', 'never',
                         '--entrypoint', '/bin/sh', 'nginx', '-ec', NGINX_PREFLIGHT,
                         label=f'{self.role} Nginx preflight (readability and nginx -t)')

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
            self.prepare_nginx_files()
        memory = self.check_memory()
        if shutil.disk_usage(ROOT).free < 2 * 1024 ** 3:
            raise RuntimeError('At least 2 GiB free disk is required before pulling a release')
        self.compose('config', '--quiet')
        if self.manifest.get('env_refresh'):
            # A configuration refresh must work with the exact images already deployed,
            # including during a registry outage. Fail before touching live containers.
            images = {self.manifest['app_image']}
            if 'nginx' in self.names:
                images.add(self.manifest['nginx_image'])
            for image in sorted(images):
                run(['docker', 'image', 'inspect', image], label=f'{self.role} check cached image')
            self.check_env_dependencies()
        else:
            self.compose('pull', *self.names)
        if self.manifest['run_migrations'] and self.release_id == transaction:
            run(['docker', 'pull', self.manifest['migration_image']])
        if self.role == 'vps1':
            self.check_nginx()
        return {'prepared': True, 'memory': memory}

    def check_env_dependencies(self):
        script = (self.bundle / 'env-preflight.mjs').read_text()
        run(['docker', 'run', '--rm', '--pull=never', '--network', 'handygo_default',
             '--user', '1000:1000', '--read-only', '--memory=128m', '--memory-swap=256m', '--cpus=0.25',
             '--pids-limit=64', '--cap-drop=ALL', '--security-opt=no-new-privileges',
             '--env-file', str(self.bundle / 'shared.env'),
             '-e', 'NODE_OPTIONS=--max-old-space-size=64',
             self.manifest['app_image'], 'node', '--input-type=module', '-e', script, self.role],
            label=f'{self.role} validate candidate ENV dependencies (no application writes)')

    def apply(self, transaction):
        state = self.owner(transaction)
        if state.get('phase', 'SNAPSHOT') not in ('SNAPSHOT', 'APPLYING'):
            raise RuntimeError('Cannot apply a terminal or verified transaction')
        tracked = self.manifest.get('container_verification_version') == 1
        evidence = state.get('container_evidence') if tracked else None
        if tracked and not evidence:
            raise RuntimeError('Container baseline missing; preserve transaction and recover')
        # Re-entering an uncertain APPLYING transaction could rerun migrations or
        # bless an external restart. Recovery must classify it before any retry.
        if tracked and state.get('phase') == 'APPLYING':
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: rollout already started; reconcile transaction')
        state.pop('verification', None)
        state.update(touched=True, phase='APPLYING')
        write(ROOT / 'pending.json', state)
        migrations = MIGRATIONS[self.role]
        if self.manifest['run_migrations'] and migrations and self.release_id == transaction:
            if tracked:
                for name, baseline in evidence['baseline'].items():
                    current = self._container_snapshot(name)
                    if baseline is None and current is not None or baseline is not None and not self._same_process(baseline, current):
                        raise RuntimeError(f'Container changed after baseline and before migration: {name}')
                evidence['stop_requested_at'] = self._now()
                write(ROOT / 'pending.json', state)
            self.compose('stop', *self.names)
            for service in migrations:
                run(['docker', 'run', '--rm', '--memory=384m', '--memory-swap=768m',
                     '--pids-limit=100', '--cap-drop=ALL', '--security-opt=no-new-privileges',
                     '--env-file', str(self.bundle / 'shared.env'), '-e', 'NODE_OPTIONS=--max-old-space-size=192', '-e', 'HANDYGO_MIGRATION=1',
                     self.manifest['migration_image'], 'pnpm', 'run', f'prisma:migrate:{service}'],
                    label=f'{self.role} migrate {service}')
        order = sorted(self.names, key=lambda n: {'user-trust-service': -3, 'auth-service': -2,
                                                'api-gateway': 1, 'nginx': 2}.get(n, 0))
        for name in order:
            before = self._container_snapshot(name) if tracked else None
            baseline = evidence['baseline'].get(name) if tracked else None
            if tracked and baseline is not None and not self._same_process(baseline, before):
                raise RuntimeError(f'Container changed outside the authorized release transition: {name}')
            intent = self._now()
            if tracked:
                evidence.setdefault('transitions', {})[name] = {'intent_at': intent, 'before': before}
                write(ROOT / 'pending.json', state)
            refresh = ('--force-recreate', '--pull', 'never') if self.manifest.get('env_refresh') else ()
            self.compose('up', '-d', '--no-build', '--no-deps', *refresh,
                         '--wait', '--wait-timeout', '240', name)
            if tracked:
                expected_image = run(['docker', 'image', 'inspect', '--format', '{{.Id}}',
                                      self.manifest['nginx_image' if name == 'nginx' else 'app_image']])
                after = self._container_snapshot(name)
                accepted = self._accept_container(name, before, after, intent, expected_image, historical_baseline=baseline)
                evidence.setdefault('accepted', {})[name] = accepted
                evidence['transitions'].pop(name, None)
                write(ROOT / 'pending.json', state)
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
            restarts = int(run(['docker', 'inspect', '--format', '{{.RestartCount}}', container]))
            if self.manifest.get('container_verification_version') == 1:
                self._verify_bound_container(name, container, expected_id)
            elif restarts:
                # Old manifests have no trustworthy pre-rollout baseline. Fail closed.
                emit(self.role, json.dumps({'release_id': self.release_id, 'service': name,
                     'container': container, 'restart_count': restarts,
                     'started_at': data.get('StartedAt'), 'finished_at': data.get('FinishedAt'),
                     'exit_code': data.get('ExitCode'), 'oom_killed': data.get('OOMKilled'),
                     'release_created_at': self.manifest.get('created_at')}))
                raise RuntimeError(f'Container has restarted; inspect before accepting legacy release: {name}')
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
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: bootstrap has no previous release')
        old = Host(self.role, state['previous']['release_id'])
        old.validate_bundle()
        if (not self.manifest.get('rollback_compatible') or not old.manifest.get('rollback_compatible')
                or not self.manifest.get('migration_hash')
                or self.manifest['migration_hash'] != old.manifest.get('migration_hash')):
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: migration compatibility is not proven')
        state.pop('verification', None)
        state['recovery_attempt'] = state.get('recovery_attempt', 0) + 1
        state['recovery_decision'] = 'RESTORE_PREVIOUS'
        state['recovery_from_phase'] = state.get('phase', 'APPLYING' if state.get('touched') else 'SNAPSHOT')
        state['phase'] = 'APPLYING'
        write(ROOT / 'pending.json', state)
        old.compose('config', '--quiet')
        # Pull may fail during registry outage; local digest cache remains usable.
        for name in old.names:
            intent = self._now()
            tracked = self.manifest.get('container_verification_version') == 1
            before = old._container_snapshot(name) if tracked else None
            if tracked:
                state.setdefault('container_evidence', {}).setdefault('transitions', {})[name] = {
                    'phase': 'RESTORE_REQUESTED', 'intent_at': intent, 'before': before}
                write(ROOT / 'pending.json', state)
            pull = 'never' if self.manifest.get('env_refresh') else 'missing'
            old.compose('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--pull', pull,
                        '--wait', '--wait-timeout', '240', name)
            if self.manifest.get('container_verification_version') == 1:
                expected = run(['docker', 'image', 'inspect', '--format', '{{.Id}}',
                                old.manifest['nginx_image' if name == 'nginx' else 'app_image']])
                restored = old._container_snapshot(name)
                accepted = old._accept_container(name, before, restored, intent, expected, force_new=True)
                state['container_evidence'].setdefault('restored', {})[name] = accepted
                state['container_evidence'].setdefault('transitions', {}).pop(name, None)
                write(ROOT / 'pending.json', state)
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
                                 ['logs', '--timestamps', '--since', '10m', '--tail', '40', container]):
                        result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=10)
                        emit(self.role, f'Diagnostics {name} / {args[0]}:')
                        emit(self.role, '\n'.join((result.stdout + result.stderr).splitlines()[-40:]))
            except Exception as error:
                emit(self.role, f'Diagnostics unavailable for {name}: {type(error).__name__}')

    def authorize_finish(self, transaction):
        """Coordinator calls only after all host and public verification succeeds."""
        state = self.owner(transaction)
        if state['phase'] not in ('SNAPSHOT', 'COMMITTED', 'RESTORED'):
            raise RuntimeError('Transaction is not safe to unlock')
        state['verification'] = 'CLUSTER_VERIFIED'
        write(ROOT / 'pending.json', state)
        return {'verification': 'CLUSTER_VERIFIED'}

    def observe_runtime(self):
        """Read-only runtime evidence, NOT release acceptance or legacy verification."""
        if read(ROOT / 'stable.json') != {'release_id': self.release_id}:
            raise RuntimeError('Stable release changed before runtime observation')
        self.validate_bundle()
        captured_at = self._now()
        containers = {}
        for name in self.names:
            current = self._container_snapshot(name)
            expected = run(['docker', 'image', 'inspect', '--format', '{{.Id}}',
                            self.manifest['nginx_image' if name == 'nginx' else 'app_image']])
            if (not current or current.get('image') != expected or not current.get('running')
                    or current.get('health') != 'healthy' or current.get('oom_killed')
                    or type(current.get('restart_count')) is not int or current['restart_count'] < 0
                    or not re.fullmatch(r'[a-f0-9]{64}', current.get('id') or '')
                    or not current.get('started_at') or not current.get('created')):
                raise RuntimeError(f'Runtime observation rejected unhealthy/image/identity mismatch: {name}')
            if name != 'nginx' and self.manifest['services'][name]['scope'] != 'health-only':
                run(['docker', 'exec', current['id'], 'node', 'ops/verify.mjs', name])
            if self._container_snapshot(name) != current:
                raise RuntimeError(f'Runtime changed/restarted during business probe: {name}')
            containers[name] = current
        # A later service probe may take time; recheck the full host before returning evidence.
        for name, current in containers.items():
            if self._container_snapshot(name) != current:
                raise RuntimeError(f'Runtime changed/restarted during host observation: {name}')
        return {'release_id': self.release_id, 'captured_at': captured_at, 'containers': containers,
                'release_accepted': False}

    def _untouched_snapshot(self, transaction):
        state = self.owner(transaction)
        evidence = state.get('container_evidence') or {}
        if (state.get('phase') != 'SNAPSHOT' or state.get('touched') is not False
                or not state.get('previous') or read(ROOT / 'stable.json') != state['previous']
                or any(evidence.get(key) for key in ('accepted', 'restored', 'transitions', 'stop_requested_at'))
                or state.get('recovery_decision') == 'RESTORE_PREVIOUS'):
            raise RuntimeError('Only an untouched snapshot with unchanged previous stable can be aborted')
        self.validate_bundle()
        return state

    def snapshot_abort_baseline(self, transaction):
        state = self._untouched_snapshot(transaction)
        old = Host(self.role, state['previous']['release_id'])
        state['snapshot_abort'] = {'baseline': old.observe_runtime(), 'fence': read(ROOT / 'fence.json')}
        if not state['snapshot_abort']['fence']:
            raise RuntimeError('Manual snapshot abort requires a fenced coordinator')
        write(ROOT / 'pending.json', state)
        return {'baseline_recorded': True}

    def authorize_snapshot_abort(self, transaction):
        state = self._untouched_snapshot(transaction)
        evidence = state.get('snapshot_abort') or {}
        if not evidence.get('baseline') or evidence.get('fence') != read(ROOT / 'fence.json'):
            raise RuntimeError('Snapshot abort baseline/fence missing or changed')
        evidence['authorization'] = 'CLUSTER_OBSERVED_NOT_RELEASE_VERIFIED'
        write(ROOT / 'pending.json', state)
        return {'authorized': True, 'release_accepted': False}

    def abort_snapshot(self, transaction):
        state = self._untouched_snapshot(transaction)
        evidence = state.get('snapshot_abort') or {}
        if (evidence.get('authorization') != 'CLUSTER_OBSERVED_NOT_RELEASE_VERIFIED'
                or not evidence.get('fence') or evidence['fence'] != read(ROOT / 'fence.json')):
            raise RuntimeError('Explicit fenced cluster observation required before snapshot abort')
        baseline = evidence.get('baseline') or {}
        try:
            captured_at = datetime.datetime.fromisoformat(baseline['captured_at'].replace('Z', '+00:00'))
            age = (datetime.datetime.now(datetime.timezone.utc) - captured_at).total_seconds()
        except (KeyError, ValueError, TypeError):
            raise RuntimeError('Invalid snapshot observation timestamp') from None
        if not 20 <= age <= 600:
            raise RuntimeError('Snapshot abort requires 20–600 seconds of fresh runtime observation')
        observed = Host(self.role, state['previous']['release_id']).observe_runtime()
        if (baseline.get('release_id') != observed['release_id']
                or baseline.get('containers') != observed['containers']):
            raise RuntimeError('Runtime changed/restarted during snapshot abort observation')
        evidence['final'] = observed
        self._untouched_snapshot(transaction)
        if not 20 <= (datetime.datetime.now(datetime.timezone.utc) - captured_at).total_seconds() <= 600:
            raise RuntimeError('Snapshot abort evidence expired during final runtime probes')
        history = ROOT / 'transactions'
        history.mkdir(mode=0o700, exist_ok=True)
        receipt = history / (transaction + '.json')
        record = {**state, 'unlock': 'ABORTED_UNTOUCHED_SNAPSHOT', 'release_accepted': False}
        existing = read(receipt)
        if existing is not None:
            if any(existing.get(key) != record[key] for key in ('transaction', 'target', 'previous', 'unlock')):
                raise RuntimeError('Existing transaction receipt conflicts with snapshot abort')
        else:
            write(receipt, record)
        # Durable receipt precedes unlink; no application, image, schema or stable mutation.
        (ROOT / 'pending.json').unlink()
        sync_directory(ROOT)
        return {'aborted': True, 'release_accepted': False}

    def finish(self, transaction):
        state = self.owner(transaction)
        if state['phase'] not in ('SNAPSHOT', 'COMMITTED', 'RESTORED'):
            raise RuntimeError('Transaction is not safe to unlock')
        stable = read(ROOT / 'stable.json')
        expected = {'release_id': self.release_id} if state['phase'] == 'COMMITTED' else state['previous']
        if stable != expected:
            raise RuntimeError('Stable state is not safe to unlock')
        if state['phase'] == 'SNAPSHOT':
            if state['touched']:
                raise RuntimeError('Touched snapshot is not safe to unlock')
        elif state.get('verification') != 'CLUSTER_VERIFIED':
            raise RuntimeError('Cluster verification required before unlock')
        self.validate_bundle()
        if state['previous']:
            Host(self.role, state['previous']['release_id']).validate_bundle()
        history = ROOT / 'transactions'
        history.mkdir(mode=0o700, exist_ok=True)
        write(history / (transaction + '.json'), {**state, 'unlock': 'VERIFIED_FINISH'})
        (ROOT / 'pending.json').unlink()
        sync_directory(ROOT)
        return {'unlocked': True}


def main():
    os.umask(0o077)
    arguments = sys.argv[1:]
    wait_lock = '--wait-lock' in arguments
    if wait_lock:
        arguments.remove('--wait-lock')
    expected_state = None
    if '--expected-state' in arguments:
        index = arguments.index('--expected-state')
        expected_state = arguments[index + 1]
        del arguments[index:index + 2]
        if not re.fullmatch(r'[a-f0-9]{64}', expected_state):
            raise ValueError('Invalid state token')
    fence = None
    if '--fence' in arguments:
        index = arguments.index('--fence')
        fence = arguments[index + 1]
        del arguments[index:index + 2]
        if not re.fullmatch(r'[1-9][0-9]*:[a-f0-9]{32}', fence):
            raise ValueError('Invalid session fence')
    action, role, release_id, transaction = arguments
    if not re.fullmatch(RELEASE_ID, transaction):
        raise ValueError('Invalid transaction ID')
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / 'deploy.lock').open('a') as lock:
        deadline = time.monotonic() + (900 if wait_lock else 0)
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Host operation still running; leave pending.json intact and retry recovery')
                time.sleep(1)
        if expected_state is not None and state_token() != expected_state:
            raise RuntimeError('Deployment state changed after inspection; refusing stale operation')
        if action == 'inspect':
            print(json.dumps(inspect_state(role)))
            return
        if action == 'claim-fence':
            if expected_state is None or fence is None:
                raise RuntimeError('Fence claim requires inspected state and session identity')
            inspect_state(role)
            existing_fence = read(ROOT / 'fence.json')
            if existing_fence is not None:
                if not isinstance(existing_fence, str) or not re.fullmatch(r'[1-9][0-9]*:[a-f0-9]{32}', existing_fence):
                    raise RuntimeError('Invalid durable fence; operator inspection required')
                if existing_fence != fence and int(fence.split(':')[0]) <= int(existing_fence.split(':')[0]):
                    raise RuntimeError('Coordinator epoch fenced; refusing stale claim')
            write(ROOT / 'fence.json', fence)
            print(json.dumps({'claimed': True, '_state': inspect_state(role)}))
            return
        if fence is not None and read(ROOT / 'fence.json') != fence:
            raise RuntimeError('Coordinator session fenced; refusing stale operation')
        host = Host(role, release_id)
        emit(role, f'Start {action}: {release_id}')
        try:
            if action == 'verify':
                result = host.verify()
            elif action == 'observe-runtime':
                result = host.observe_runtime()
            elif action in ('snapshot-abort-baseline', 'authorize-snapshot-abort', 'abort-snapshot'):
                if expected_state is None or fence is None:
                    raise RuntimeError('Snapshot abort requires inspected state and session fence')
                result = getattr(host, action.replace('-', '_'))(transaction)
            elif action == 'authorize-finish':
                result = host.authorize_finish(transaction)
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
        if expected_state is not None:
            result['_state'] = inspect_state(role)
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('host', f'{type(error).__name__}: {redact(error)}')
        sys.exit(1)
