"""Static Production contracts; no cloud credentials or Docker daemon needed."""
import json
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
PROD = ROOT / 'deploy/production'
registry = json.loads((PROD / 'services.json').read_text())['services']
services = yaml.safe_load((PROD / 'compose.production.yml').read_text())['services']
apps = {p.name for p in (ROOT / 'apps').iterdir() if (p / 'src/main.ts').exists()}
assert set(registry) == apps
assert set(services) == apps | {'nginx'}
assert not any(PROD.glob('compose.vps*.yml'))
assert set(p.name for p in (PROD / 'env').glob('*')) == {'production.env.example'}
totals = {'vps1': 32, 'vps2': 0, 'vps3': 0}
for name, item in registry.items():
    service = services[name]
    assert item['state'] in ('READY', 'PARTIAL', 'NOT_READY')
    assert not (item['state'] == 'NOT_READY' and item['deploy'])
    assert service['profiles'] == ([item['host']] if item['deploy'] else ['disabled'])
    assert service['env_file'] == [{'path': '${APP_ENV_FILE:?Shared application ENV required}', 'format': 'raw'}]
    assert service['environment']['PORT'] == str(item['port'])
    assert service['mem_limit'] == service['memswap_limit'] == f'{item["memory_mib"]}m'
    assert service['read_only'] and service['cap_drop'] == ['ALL']
    assert service['logging']['options']['max-file'] == '3'
    assert 'build' not in service and 'depends_on' not in service
    if item['host'] == 'vps1':
        assert 'ports' not in service
    else:
        assert service['ports'] == [f'${{PRIVATE_IP:?WireGuard IP required}}:{item["port"]}:{item["port"]}']
    if item['deploy']:
        totals[item['host']] += item['memory_mib']
assert services['nginx']['profiles'] == ['vps1']
assert 'env_file' not in services['nginx']
assert services['nginx']['ports'] == ['80:8080', '443:8443']
for role, total in totals.items():
    assert total + 280 <= 1024, f'{role}: container caps plus host reserve exceed 1 GiB'
    print(f'{role}: container cap {total} MiB; future workload must be benchmarked')
example = (PROD / 'env/production.env.example').read_text()
keys = [line.partition('=')[0] for line in example.splitlines() if line and not line.startswith('#')]
assert len(keys) == len(set(keys))
workflow = yaml.safe_load((ROOT.parent / '.github/workflows/backend-production.yml').read_text())
trigger = workflow.get('on', workflow.get(True))  # PyYAML YAML 1.1 `on` versus Actions YAML 1.2.
assert set(trigger) == {'push', 'workflow_dispatch'}
assert trigger['push']['branches'] == ['release']
assert workflow['concurrency']['cancel-in-progress'] is False
assert workflow['jobs']['deploy']['environment'] == 'production'
assert trigger['workflow_dispatch']['inputs']['bypass_pr_ci']['type'] == 'boolean'
assert trigger['workflow_dispatch']['inputs']['bypass_pr_ci']['default'] is False
deploy_steps = workflow['jobs']['deploy']['steps']
ssh_setup = next(step for step in deploy_steps if 'VPS1_SSH_KEY' in step.get('env', {}))
for role in ('VPS1', 'VPS2', 'VPS3'):
    name = role + '_SSH_KEY'
    assert ssh_setup['env'][name] == '${{ secrets.' + name + ' }}'
assert 'SSH_PRIVATE_KEY' not in ssh_setup['env']
assert 'SSH_KNOWN_HOSTS' not in ssh_setup['env']
cleanup = next(step for step in deploy_steps if step.get('name') == 'Remove runner secrets')
assert cleanup['if'] == 'always()'
assert all('~/.ssh/handygo_' + role in cleanup['run'] for role in ('vps1', 'vps2', 'vps3'))
verification = workflow['jobs']['verify']['steps']
assert any(step.get('run') == 'python3 scripts/verify-production-ci.py' for step in verification)
proof_step = next(step for step in verification if step.get('run') == 'python3 scripts/verify-production-ci.py')
assert proof_step['env']['BYPASS_PR_CI'] == '${{ inputs.bypass_pr_ci || false }}'
assert not any('pnpm' in step.get('run', '') or step.get('uses', '').startswith('pnpm/') for step in verification)
assert workflow['permissions']['actions'] == 'read'
assert workflow['permissions']['pull-requests'] == 'read'
pr_workflow = yaml.safe_load((ROOT.parent / '.github/workflows/pr-ci.yml').read_text())
pr_steps = pr_workflow['jobs']['backend-ci']['steps']
assert any('scripts/record-ci-proof.py' in step.get('run', '') for step in pr_steps)
assert any(step.get('with', {}).get('name') == 'backend-ci-proof-${{ github.run_attempt }}' for step in pr_steps)
gate_commands = ['pnpm run lint', 'pnpm run typecheck', 'pnpm run test', 'pnpm run build']
for command in gate_commands:
    assert sum(step.get('run') == command for step in pr_steps) == 1
record_index = next(i for i, step in enumerate(pr_steps) if 'scripts/record-ci-proof.py' in step.get('run', ''))
assert all(next(i for i, step in enumerate(pr_steps) if step.get('run') == command) < record_index
           for command in gate_commands)
filters = pr_workflow['jobs']['detect-changes']['steps'][1]['with']['filters']
assert '.github/workflows/pr-ci.yml' in filters and '.github/workflows/backend-production.yml' in filters
print('Production contracts passed')
