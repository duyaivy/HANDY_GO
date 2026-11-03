#!/usr/bin/env python3
"""Conservative cluster reconciliation. No migrations, TTLs, or blind journal deletion."""
import argparse
import re

from orchestrate import Coordinator, ROLES, ID
from release_log import redact


def release(state):
    return (state or {}).get('release_id')


def plan(states, expected=None):
    owned = {}
    for r, s in states.items():
        if s.get('pending'):
            p = dict(s['pending'])
            if 'phase' not in p and type(p.get('touched')) is bool:
                p['phase'] = 'APPLYING' if p['touched'] else 'SNAPSHOT'
            owned[r] = p
    stable_ids = {release(s['stable']) for s in states.values()}
    if not owned:
        if len(stable_ids) != 1:
            raise RuntimeError('INCONSISTENT_STATE: stable releases differ')
        stable = next(iter(stable_ids))
        if stable:
            manifests = [s['manifests'][stable] for s in states.values()]
            if any(m != manifests[0] for m in manifests):
                raise RuntimeError('INCONSISTENT_STATE: stable metadata differs')
        return {'decision': 'RECOVERY_NOT_NEEDED', 'owned': {}}
    identities = {(p['transaction'], p['target']) for p in owned.values()}
    deferred = False
    if len(identities) != 1:
        # Only independently untouched snapshots may be detached from mixed owners.
        # Every host must still verify the same previous release before cleanup.
        candidates = [identity for identity in identities if (not expected or identity == expected)
                      and all(p['phase'] == 'SNAPSHOT' and p['touched'] is False
                              for p in owned.values() if (p['transaction'], p['target']) == identity)]
        if not candidates or len(stable_ids) != 1 or None in stable_ids:
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: mismatched transaction owner/target')
        selected = sorted(candidates)[0]
        owned = {r: p for r, p in owned.items() if (p['transaction'], p['target']) == selected}
        identities, deferred = {selected}, True
    if expected and identities != {expected}:
        raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: mismatched transaction owner/target')
    transaction, target = next(iter(identities))
    previous_ids = {release(p['previous']) for p in owned.values()}
    if len(previous_ids) != 1:
        raise RuntimeError('INCONSISTENT_STATE: previous snapshots differ')
    previous = next(iter(previous_ids))
    manifests = [states[r]['manifests'][target] for r in owned]
    if any(m != manifests[0] for m in manifests):
        raise RuntimeError('INCONSISTENT_STATE: target manifests differ')
    target_manifest = manifests[0]
    result = dict(owned=owned, transaction=transaction, target=target, previous=previous,
                  manifest=target_manifest, deferred=deferred)
    if stable_ids == {target}:
        if any(p['phase'] not in ('VERIFIED', 'COMMITTED') for p in owned.values()):
            raise RuntimeError('INCONSISTENT_STATE: target stable with unexpected journal phase')
        if any(s['manifests'][target] != target_manifest for s in states.values()):
            raise RuntimeError('INCONSISTENT_STATE: committed target metadata differs')
        return dict(result, decision='VERIFY_COMMITTED', verify=target)
    if any(release(s['stable']) != previous for r, s in states.items() if r not in owned):
        raise RuntimeError('INCONSISTENT_STATE: unlocked host has unexpected stable release')
    if any(release(states[r]['stable']) not in (previous, target) for r in owned):
        raise RuntimeError('INCONSISTENT_STATE: participant stable is unrelated')
    untouched = all(p['phase'] == 'SNAPSHOT' and p['touched'] is False for p in owned.values())
    if untouched and stable_ids != {previous}:
        raise RuntimeError('INCONSISTENT_STATE: untouched snapshot changed stable')
    if previous is None:
        # A pristine bootstrap snapshot can be released; a touched bootstrap cannot.
        if untouched:
            return dict(result, decision='FINISH_SNAPSHOT', verify=None)
        raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: bootstrap has no previous release')
    old = [s['manifests'][previous] for s in states.values()]
    if any(m != old[0] for m in old):
        raise RuntimeError('INCONSISTENT_STATE: previous manifests differ')
    if not untouched and (not target_manifest.get('rollback_compatible') or
                          not old[0].get('rollback_compatible') or
                          target_manifest['migration_hash'] != old[0]['migration_hash']):
        raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: migration compatibility not proven; never undo DB automatically')
    return dict(result, decision='FINISH_SNAPSHOT' if untouched else 'RESTORE_PREVIOUS',
                verify=previous, previous_manifest=old[0])


def reconcile(coordinator, expected=None, automatic=False, inspect_only=False, env_only=False):
    c = coordinator
    try:
        states = c.inspect_cluster()
        recovery = plan(states, expected)
        c.journal['recovery'] = {k: v for k, v in recovery.items()
                                 if k not in ('manifest', 'previous_manifest', 'owned')}
        c.journal['recovery']['participants'] = list(recovery['owned'])
        c.journal['recovery']['classification'] = ('NO_PENDING' if recovery['decision'] == 'RECOVERY_NOT_NEEDED'
                                                    else 'RECOVERY_REQUIRED')
        c.persist()
        if recovery['decision'] == 'RECOVERY_NOT_NEEDED':
            c.journal['status'] = 'RECOVERY_NOT_NEEDED'
            c.persist()
            return
        if env_only:
            manifest = recovery['manifest']
            if not (manifest.get('env_refresh') is True and manifest.get('run_id') == c.args.run_id
                    and manifest.get('run_attempt') == c.args.attempt
                    and re.fullmatch(rf'prod-[0-9]{{8}}-{c.args.run_id}-a{c.args.attempt}', recovery['transaction'])
                    and recovery['target'] == recovery['transaction']):
                raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: requires matching ENV-only manifests for original run')
        if inspect_only:
            c.journal['status'] = 'RECOVERY_REQUIRED'
            c.persist()
            return
        c.transaction, c.target = recovery['transaction'], recovery['target']
        c.journal.update(transaction=c.transaction, target_release=c.target)
        owned = recovery['owned']
        # Every candidate is validated before the first mutation. Reads and all
        # subsequent actions use state tokens under flock as an additional fence.
        if recovery['decision'] == 'RESTORE_PREVIOUS':
            for role in reversed(ROLES):
                if role in owned and owned[role].get('phase') != 'RESTORED':
                    result = c.remote(role, 'restore', wait_lock=True)
                    c.journal['rollback'][role] = result['rollback']
                    if result['rollback'] not in ('RESTORED', 'NOT_NEEDED'):
                        raise RuntimeError(f'{role}: restore did not complete')
        verify = recovery['verify']
        if verify:
            for role in ROLES:
                c.remote(role, 'verify', verify, wait_lock=True)
            c.public_smoke(recovery['manifest'] if verify == c.target else recovery['previous_manifest'])
        if recovery['decision'] == 'VERIFY_COMMITTED':
            for role, pending in owned.items():
                if pending.get('phase') == 'VERIFIED':
                    c.remote(role, 'commit', wait_lock=True)
        # Recheck durable cluster state after probes, before authorizing cleanup.
        checked = c.inspect_cluster()
        if any(release(s['stable']) != verify for s in checked.values()):
            raise RuntimeError('INCONSISTENT_STATE: stable changed during verification')
        for role in owned:
            p = checked[role]['pending']
            if not p or (p['transaction'], p['target']) != (c.transaction, c.target):
                raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: ownership changed during recovery')
        for role in owned:
            c.remote(role, 'authorize-finish', wait_lock=True)
        for role in owned:
            c.remote(role, 'finish', wait_lock=True)
        remaining = any(s['pending'] for s in c.inspect_cluster().values())
        if remaining and not recovery['deferred']:
            raise RuntimeError('RECOVERY_REQUIRED: cleanup incomplete')
        c.journal['recovery'].update(verification='PASSED', unlock='COMPLETE')
        c.journal['status'] = 'STABLE' if recovery['decision'] == 'VERIFY_COMMITTED' else 'FAILED_ROLLBACK_SUCCESS'
        if remaining:
            c.journal['status'] = 'RECOVERY_REQUIRED'
        c.persist()
    except Exception as error:
        c.journal['status'] = 'MANUAL_INTERVENTION_REQUIRED'
        c.journal['recovery_error'] = redact(error)
        c.persist()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', type=int, required=True)
    parser.add_argument('--attempt', type=int, required=True)
    parser.add_argument('--transaction', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--domain', required=True)
    parser.add_argument('--output', default='recovery-output')
    parser.add_argument('--recover', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(ID, args.target) or not re.fullmatch(
            rf'prod-[0-9]{{8}}-{args.run_id}-a{args.attempt}', args.transaction):
        parser.error('Exact transaction must match original Run ID and Attempt; target must be a release ID')
    args.env_file, args.rollback_release = None, args.target
    c = Coordinator(args)
    c.transaction, c.target = args.transaction, args.target
    c.journal.update(transaction=c.transaction, target_release=c.target, operation='production-recovery')
    with c.cluster_lock():
        reconcile(c, expected=(args.transaction, args.target), inspect_only=not args.recover)


if __name__ == '__main__':
    main()
