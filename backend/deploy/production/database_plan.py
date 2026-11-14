"""Offline production budget/DDL validation. Never connects or emits credentials."""
import json
from pathlib import Path
import re
import shlex
from urllib.parse import urlsplit, parse_qs

# Compatibility export for existing callers/tests, derived from the authoritative registry.
# Runtime budget checks use the supplied (possibly historical) registry instead.
SERVICES = tuple(entry['migration'] for entry in json.loads(
    Path(__file__).with_name('services.json').read_text())['services'].values()
    if entry.get('migration'))


def migration_services(registry):
    result = {}
    for name, entry in registry.items():
        if 'migration' not in entry:
            raise ValueError(f'{name}: explicit migration classification required')
        service = entry['migration']
        if service is None:
            continue
        if not isinstance(service, str) or not re.fullmatch(r'[a-z][a-z0-9-]*', service):
            raise ValueError(f'{name}: invalid migration key')
        if service in result:
            raise ValueError(f'Duplicate registered migration key: {service}')
        result[service] = (name, entry)
    return result


def integer(values, key, default=None, minimum=1, maximum=100000):
    raw = values.get(key)
    raw = raw.strip() if isinstance(raw, str) else raw
    if raw in (None, ''):
        raw = default
    if raw is None or not re.fullmatch(r'[1-9][0-9]*', str(raw)) or not minimum <= int(raw) <= maximum:
        raise ValueError(f'{key}: integer in [{minimum}, {maximum}] required')
    return int(raw)


def endpoint(raw, label):
    try:
        url = urlsplit(raw.strip())
        if url.scheme not in ('postgres', 'postgresql') or not url.hostname or not url.username or not url.path.strip('/') or not 1 <= (url.port if url.port is not None else 5432) <= 65535:
            raise ValueError()
        return url, (url.hostname.lower(), url.port or 5432, url.username, url.path)
    except ValueError:
        raise ValueError(f'{label}: valid PostgreSQL endpoint required') from None


def migration_schema(service):
    return 'message' if service == 'message' else service.replace('-', '_') + '_service'


def migration_endpoint(values, service, migrating=False):
    suffix = service.upper().replace('-', '_')
    direct = values.get('DIRECT_URL_' + suffix, '').strip()
    raw = direct or values.get('DATABASE_URL_' + suffix, '').strip() or values.get('DATABASE_URL', '').strip()
    url, _ = endpoint(raw, 'DIRECT_URL_' + suffix if direct else service)
    schema = parse_qs(url.query).get('schema', [migration_schema(service)])
    if direct and schema != [migration_schema(service)]:
        raise ValueError(f'DIRECT_URL_{suffix}: wrong migration schema')
    if migrating:
        # Supavisor transaction mode cannot preserve Prisma Migrate advisory locks.
        # Do not guess pool modes for other providers or rewrite credentials/ports.
        if url.hostname.lower().endswith('.pooler.supabase.com') and (url.port if url.port is not None else 5432) == 6543:
            raise ValueError(f'{service}: migrations require a direct or session endpoint; transaction pooler unsupported')
        if values.get('DB_DDL_VERIFIED_' + suffix) != 'true':
            raise ValueError(f'DB_DDL_VERIFIED_{suffix}: confirm effective endpoint targets same database and permits DDL')
    return url


def validate_database_plan(values, registry, run_migrations=False, migration_scope=None):
    groups, endpoints = {}, {}
    registered = migration_services(registry)
    scope = None if migration_scope is None else set(migration_scope)
    if scope is not None and not scope <= set(registered):
        raise ValueError('Migration scope references unregistered service')
    for service, (name, entry) in registered.items():
        if not entry.get('deploy'):
            continue
        suffix = service.upper().replace('-', '_')
        url, identity = endpoint(values.get('DATABASE_URL_' + suffix, '').strip() or values.get('DATABASE_URL', '').strip(), service)
        if {'connection_limit', 'pool_timeout'} & parse_qs(url.query).keys():
            raise ValueError(f'{service}: configure driver pool with DB_POOL_*')
        group = values.get('DB_POOL_GROUP_' + suffix, '')
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', group):
            raise ValueError(f'DB_POOL_GROUP_{suffix}: verified provider pool group required')
        if identity in endpoints and endpoints[identity] != group:
            raise ValueError(f'{service}: identical endpoint cannot be split across budget groups')
        endpoints[identity] = group
        maximum = integer(values, 'DB_POOL_MAX_' + suffix, values.get('DB_POOL_MAX', '').strip() or None, maximum=100)
        replicas = integer(values, 'DB_POOL_REPLICAS_' + suffix)
        groups[group] = groups.get(group, 0) + maximum * replicas
        migration_endpoint(values, service, migrating=run_migrations and (scope is None or service in scope))
    integer(values, 'DB_POOL_TIMEOUT_MS', '5000', maximum=60000)
    integer(values, 'DB_POOL_IDLE_MS', '10000', maximum=300000)
    result = {}
    for group, demand in groups.items():
        limit = integer(values, 'DB_POOL_LIMIT_' + group)
        reserve = integer(values, 'DB_POOL_RESERVE_' + group, minimum=1)
        if demand + reserve > limit:
            raise ValueError(f'Pool group {group}: demand {demand} + reserve {reserve} exceeds limit {limit}')
        result[group] = {'application_connections': demand, 'reserve': reserve, 'limit': limit}
    return result


def _inside(root, path, label):
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError(f'{label}: path must remain inside repository')
    return resolved


def _script_paths(root, service, command):
    """Parse argv, never execute a shell or TypeScript while validating coverage."""
    try:
        argv = shlex.split(command)
    except ValueError:
        raise ValueError(f'Migration deploy script invalid: {service}') from None
    if argv[:2] == ['pnpm', 'exec']:
        argv = argv[2:]
    if argv[:3] != ['prisma', 'migrate', 'deploy']:
        raise ValueError(f'Migration deploy script missing or invalid: {service}')
    options = {}
    remaining = iter(argv[3:])
    for argument in remaining:
        key, separator, value = argument.partition('=')
        if key not in ('--schema', '--config') or key in options:
            raise ValueError(f'Migration deploy script invalid option: {service}')
        options[key] = value if separator else next(remaining, '')
    if set(options) != {'--schema', '--config'} or not all(options.values()):
        raise ValueError(f'Migration deploy schema/config missing: {service}')
    paths = {key: _inside(root, root / value, service) for key, value in options.items()}
    if any(not path.is_file() for path in paths.values()):
        raise ValueError(f'Migration schema/config cannot be resolved: {service}')
    return paths['--schema'], paths['--config']


def migration_inventory(root, registry):
    """Discover database owners independently of the deployment registry's declarations.

    Current Prisma configs use literal paths and migrationUrl(service, schema).
    Unsupported dynamic config fails closed rather than pretending it was resolved.
    Non-database applications must be explicitly classified with migration: null.
    """
    root = Path(root)
    scripts = json.loads((root / 'package.json').read_text()).get('scripts', {})
    registered = migration_services(registry)
    inventory = {}
    app_dirs = sorted((root / 'apps').iterdir())
    foundations = root / 'foundations'
    if foundations.is_dir():
        app_dirs.extend(sorted(foundations.iterdir()))
    for app in app_dirs:
        if not app.is_dir():
            continue
        schemas = sorted(app.rglob('*.prisma'))
        sql_files = sorted(app.rglob('migration.sql'))
        configs = sorted(app.rglob('prisma.config.*'))
        if not (schemas or sql_files or configs):
            if app.name in registry and registry[app.name].get('migration') is not None:
                raise ValueError(f'Registered migration has no Prisma schema: {app.name}')
            continue
        if len(schemas) != 1:
            raise ValueError(f'Exactly one resolvable Prisma schema required: {app.name}')
        key = app.name.removesuffix('-service')
        if key not in registered or registered[key][0] != app.name:
            raise ValueError(f'Migration owner classification missing or invalid: {app.name}')
        entry = registry[app.name]
        if entry.get('deploy') is not True or entry.get('state') == 'NOT_READY' or entry.get('host') not in ('vps1', 'vps2', 'vps3', 'vps4'):
            raise ValueError(f'Migration service has no production execution path: {app.name}')
        schema, config = _script_paths(root, key, scripts.get('prisma:migrate:' + key, ''))
        if schema != schemas[0].resolve() or not config.is_relative_to(app.resolve()):
            raise ValueError(f'Migration script points to another service: {key}')
        source = config.read_text()
        resolver = re.search(r"from\s+['\"]([^'\"]*migration-url(?:\.js|\.ts))['\"]", source)
        if not resolver:
            raise ValueError(f'Prisma database URL resolver cannot be resolved: {key}')
        resolver_path = _inside(root, config.parent / resolver[1], key)
        if resolver_path.suffix == '.js' and not resolver_path.is_file():
            resolver_path = resolver_path.with_suffix('.ts')
        if not resolver_path.is_file():
            raise ValueError(f'Prisma database URL resolver missing: {key}')
        schema_match = re.search(r"\bschema\s*:\s*['\"]([^'\"]+)['\"]", source)
        migrations_match = re.search(r"\bmigrations\s*:\s*\{\s*path\s*:\s*['\"]([^'\"]+)['\"]", source)
        database_match = re.search(r"\bmigrationUrl\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)", source)
        if not schema_match or not migrations_match or not database_match:
            raise ValueError(f'Prisma config paths/database contract cannot be resolved: {key}')
        if _inside(root, config.parent / schema_match[1], key) != schema:
            raise ValueError(f'Prisma config and CLI schema disagree: {key}')
        migrations = _inside(root, config.parent / migrations_match[1], key)
        if not migrations.is_relative_to(app.resolve()) or not migrations.is_dir():
            raise ValueError(f'Migration directory cannot be resolved: {key}')
        if not list(migrations.glob('*/migration.sql')):
            raise ValueError(f'Migration SQL missing: {key}')
        if set(path.resolve() for path in sql_files) != set(path.resolve() for path in migrations.glob('*/migration.sql')):
            raise ValueError(f'Migration SQL outside configured execution path: {key}')
        expected_schema = migration_schema(key)
        if database_match[1] != key or database_match[2] != expected_schema:
            raise ValueError(f'Migration database/schema contract mismatch: {key}')
        if type(entry.get('migration_order')) is not int or entry['migration_order'] < 0:
            raise ValueError(f'Migration execution order missing: {key}')
        inventory[key] = {'service': app.name, 'host': entry['host'], 'order': entry['migration_order'],
                          'schema': str(schema.relative_to(root.resolve())),
                          'config': str(config.relative_to(root.resolve())),
                          'migrations': str(migrations.relative_to(root.resolve())),
                          'script': 'prisma:migrate:' + key,
                          'database_env': 'DATABASE_URL_' + key.upper().replace('-', '_'),
                          'ddl_env': 'DIRECT_URL_' + key.upper().replace('-', '_'),
                          'postgres_schema': database_match[2]}
    if set(inventory) != set(registered):
        raise ValueError('Configured migration references nonexistent Prisma service')
    return inventory


def validate_migration_owners(root, registry, owners):
    configured = [name for names in owners.values() for name in names]
    if len(configured) != len(set(configured)):
        raise ValueError('Migration owners must cover every Prisma service exactly once')
    if set(owners) != {'vps1', 'vps2', 'vps3', 'vps4'}:
        raise ValueError('Migration owner roles must match production VPS topology')
    inventory = migration_inventory(root, registry)
    if set(configured) != set(inventory):
        raise ValueError('Migration owners must cover every Prisma service exactly once')
    for role, services in owners.items():
        expected_order = tuple(key for key, item in sorted(inventory.items(), key=lambda item: item[1]['order']) if item['host'] == role)
        if tuple(services) != expected_order:
            raise ValueError(f'Migration execution owner order differs from production registry: {role}')
        for service in services:
            if inventory[service]['host'] != role:
                raise ValueError(f'Migration owner host mismatch: {service}')
    return inventory


def onboarding_migration_proof(root, owners):
    """Bind the complete inventory to a historical baseline plus exact additive SQL.

    Scoped deploys must never certify unrelated, unexecuted migrations as applied.
    Reconstructing the old complete hash proves those files and owners unchanged.
    Every prefix of the approved additions remains safe for the old applications.
    """
    import hashlib
    from host import ONBOARDING_ADDITIVE_SQL
    root = Path(root)
    migrations = sorted((root / 'apps').glob('*/prisma/migrations/**/migration.sql'))
    found = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in migrations if str(p.relative_to(root)) in ONBOARDING_ADDITIVE_SQL}
    if found != ONBOARDING_ADDITIVE_SQL:
        raise ValueError('Onboarding SQL differs from reviewed additive migration policy')
    def inventory_hash(paths, ownership):
        data = b''.join(str(p.relative_to(root)).encode() + b'\0' + p.read_bytes() for p in paths)
        data += b'\0owners\0' + json.dumps(ownership, sort_keys=True).encode()
        return hashlib.sha256(data).hexdigest()
    baseline_owners = {role: names for role, names in owners.items() if role != 'vps4'}
    return {'policy': 'vps4-additive-v3', 'sql': found,
            'baseline_hash': inventory_hash([p for p in migrations if str(p.relative_to(root)) not in found], baseline_owners),
            'inventory_hash': inventory_hash(migrations, owners)}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Validate production migration inventory without database access')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    import host
    registry = json.loads((args.root / 'deploy/production/services.json').read_text())['services']
    inventory = validate_migration_owners(args.root, registry, host.MIGRATIONS)
    print(json.dumps({'migrations': inventory, 'non_migratable': sorted(
        name for name, entry in registry.items() if entry['migration'] is None)}, indent=2))
