#!/usr/bin/env python3
"""Conservative cluster reconciliation. No migrations, TTLs, or blind journal deletion."""
import argparse
import re
import time

from orchestrate import Coordinator, ROLES, ID
from release_log import redact


def release(state):
    return (state or {}).get('release_id')


def plan(states, expected=None, onboarding=False):
    onboarding = onboarding or any(
        isinstance(s.get('pending'), dict) and s['pending'].get('onboarding') is True
        for s in states.values())
    if onboarding and 'vps4' in states and release(states['vps4'].get('stable')) is None:
        if states['vps4'].get('pending') is not None or states['vps4'].get('manifests'):
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: onboarding VPS4 is not pristine')
    owned = {}
    for r, s in states.items():
        if s.get('pending'):
            p = dict(s['pending'])
            if 'phase' not in p and type(p.get('touched')) is bool:
                p['phase'] = 'APPLYING' if p['touched'] else 'SNAPSHOT'
            owned[r] = p
    stable_ids = {release(s['stable']) for s in states.values()}
    if not owned:
        if onboarding and 'vps4' in states and release(states['vps4']['stable']) is not None:
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: onboarding VPS4 is already initialized')
        if onboarding and set(states) == set(ROLES) and stable_ids == {None, next(
                (release(s['stable']) for r, s in states.items() if r != 'vps4'), None)}:
            baseline = release(states['vps1']['stable'])
            if (baseline is None or any(release(states[r]['stable']) != baseline for r in ('vps1', 'vps2', 'vps3'))
                    or states['vps4'].get('pending') is not None or states['vps4'].get('manifests')):
                raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: onboarding VPS4 is not pristine')
            return {'decision': 'RECOVERY_NOT_NEEDED', 'owned': {}, 'onboarding': True,
                    'previous': baseline}
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
    onboarding_participants = [r for r, p in owned.items() if p.get('onboarding') is True]
    if onboarding_participants:
        if (onboarding_participants != ['vps4'] or release(owned['vps4']['previous']) is not None
                or states['vps4']['manifests'].get(target, {}).get('onboard_vps4') is not True):
            raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: invalid VPS4 onboarding journal')
        previous_values = {release(s['stable']) for r, s in states.items() if r != 'vps4'}
        previous_values.update(release(p['previous']) for r, p in owned.items() if r != 'vps4')
        if len(previous_values) != 1 or None in previous_values:
            raise RuntimeError('INCONSISTENT_STATE: onboarding baseline releases differ')
        previous = next(iter(previous_values))
    else:
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
    if any(release(states[r]['stable']) not in ((previous, target, None) if onboarding and r == 'vps4'
                                                else (previous, target)) for r in owned):
        raise RuntimeError('INCONSISTENT_STATE: participant stable is unrelated')
    untouched = all(p['phase'] == 'SNAPSHOT' and p['touched'] is False for p in owned.values())
    if untouched and stable_ids != ({previous, None} if onboarding_participants else {previous}):
        raise RuntimeError('INCONSISTENT_STATE: untouched snapshot changed stable')
    if previous is None:
        # A pristine bootstrap snapshot can be released; a touched bootstrap cannot.
        if untouched:
            return dict(result, decision='FINISH_SNAPSHOT', verify=None, onboarding=True)
        raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: bootstrap has no previous release')
    old = [s['manifests'][previous] for r, s in states.items() if r != 'vps4' or not onboarding]
    if any(m != old[0] for m in old):
        raise RuntimeError('INCONSISTENT_STATE: previous manifests differ')
    if not untouched and (not target_manifest.get('rollback_compatible') or
                          not old[0].get('rollback_compatible') or
                          (not onboarding and target_manifest['migration_hash'] != old[0]['migration_hash'])):
        raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: migration compatibility not proven; never undo DB automatically')
    return dict(result, decision='FINISH_SNAPSHOT' if untouched else 'RESTORE_PREVIOUS',
                verify=previous, previous_manifest=old[0], onboarding=bool(onboarding_participants))


def abort_untouched_snapshot(c, recovery, expected):
    """Explicit operator cancellation; never certify the degraded previous release."""
    if (not expected or recovery['decision'] != 'FINISH_SNAPSHOT' or recovery.get('deferred')
            or not recovery.get('previous')):
        raise RuntimeError('Manual snapshot abort requires exactly one untouched transaction with previous stable')
    c.transaction, c.target = recovery['transaction'], recovery['target']
    c.journal.update(transaction=c.transaction, target_release=c.target)
    owned = recovery['owned']
    previous = recovery['previous']
    for role in owned:
        c.remote(role, 'snapshot-abort-baseline', wait_lock=True)
    first = {role: c.remote(role, 'observe-runtime', previous, wait_lock=True) for role in ROLES}
    time.sleep(20)
    second = {role: c.remote(role, 'observe-runtime', previous, wait_lock=True) for role in ROLES}
    for role in ROLES:
        if (first[role].get('release_id') != previous or second[role].get('release_id') != previous
                or not first[role].get('containers')
                or first[role]['containers'] != second[role].get('containers')
                or first[role].get('release_accepted') is not False
                or second[role].get('release_accepted') is not False):
            raise RuntimeError(f'{role}: runtime changed during snapshot abort observation')
    c.public_smoke(recovery['previous_manifest'])
    checked = plan(c.inspect_cluster(), expected)
    if (checked['decision'] != 'FINISH_SNAPSHOT' or checked.get('deferred')
            or set(checked['owned']) != set(owned) or checked.get('previous') != previous
            or checked.get('manifest') != recovery.get('manifest')
            or checked.get('previous_manifest') != recovery.get('previous_manifest')):
        raise RuntimeError('Transaction/stable state changed during snapshot abort observation')
    for role in owned:
        c.remote(role, 'authorize-snapshot-abort', wait_lock=True)
    for role in owned:
        c.remote(role, 'abort-snapshot', wait_lock=True)
    after = c.inspect_cluster()
    if any(s['pending'] or release(s['stable']) != previous for s in after.values()):
        raise RuntimeError('RECOVERY_REQUIRED: snapshot abort cleanup incomplete or stable changed')
    c.journal['recovery'].update(observation=second, unlock='ABORTED_UNTOUCHED_SNAPSHOT',
                                 verification='NOT_RELEASE_VERIFIED')
    c.journal['status'] = 'SNAPSHOT_ABORTED_PREVIOUS_NOT_VERIFIED'
    c.persist()


def reconcile(coordinator, expected=None, automatic=False, inspect_only=False, env_only=False, abort_untouched=False,
              onboarding=False):
    c = coordinator
    try:
        states = c.inspect_cluster()
        recovery = plan(states, expected, onboarding=onboarding or bool(getattr(c.args, 'onboard_vps4', False)))
        c.journal['recovery'] = {k: v for k, v in recovery.items()
                                 if k not in ('manifest', 'previous_manifest', 'owned')}
        c.journal['recovery']['participants'] = list(recovery['owned'])
        c.journal['recovery']['classification'] = ('NO_PENDING' if recovery['decision'] == 'RECOVERY_NOT_NEEDED'
                                                    else 'RECOVERY_REQUIRED')
        c.persist()
        if abort_untouched and (automatic or inspect_only or env_only or not expected):
            raise RuntimeError('Snapshot abort is an explicit manual recovery mode only')
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
        if abort_untouched:
            abort_untouched_snapshot(c, recovery, expected)
            return
        if automatic and recovery['decision'] != 'FINISH_SNAPSHOT':
            c.journal['status'] = 'RECOVERY_REQUIRED'
            c.persist()
            raise RuntimeError(f'RECOVERY_REQUIRED: automatic preflight cannot execute {recovery["decision"]}; manual recovery required')
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
                if recovery.get('onboarding') and role == 'vps4' and verify == recovery['previous']:
                    continue
                c.remote(role, 'verify', verify, wait_lock=True)
            c.public_smoke(recovery['manifest'] if verify == c.target else recovery['previous_manifest'])
        if recovery['decision'] == 'VERIFY_COMMITTED':
            for role, pending in owned.items():
                if pending.get('phase') == 'VERIFIED':
                    c.remote(role, 'commit', wait_lock=True)
        # Recheck durable cluster state after probes, before authorizing cleanup.
        checked = c.inspect_cluster()
        if any(release(s['stable']) != verify and not (recovery.get('onboarding') and r == 'vps4' and verify == recovery['previous'] and release(s['stable']) is None)
               for r, s in checked.items()):
            raise RuntimeError('INCONSISTENT_STATE: stable changed during verification')
        for role in owned:
            p = checked[role]['pending']
            if not p or (p['transaction'], p['target']) != (c.transaction, c.target):
                raise RuntimeError('MANUAL_INTERVENTION_REQUIRED: ownership changed during recovery')
        finish_roles = [role for role in owned if role != 'vps4']
        if recovery.get('onboarding') and 'vps4' in owned:
            finish_roles.append('vps4')
        else:
            finish_roles = list(owned)
        for role in finish_roles:
            c.remote(role, 'authorize-finish', wait_lock=True)
        for role in finish_roles:
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
        status = 'RECOVERY_REQUIRED' if str(error).startswith('RECOVERY_REQUIRED') else 'MANUAL_INTERVENTION_REQUIRED'
        c.journal['status'] = status
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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--recover', action='store_true')
    mode.add_argument('--abort-untouched', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(ID, args.target) or not re.fullmatch(
            rf'prod-[0-9]{{8}}-{args.run_id}-a{args.attempt}', args.transaction):
        parser.error('Exact transaction must match original Run ID and Attempt; target must be a release ID')
    args.env_file, args.rollback_release = None, args.target
    c = Coordinator(args)
    c.transaction, c.target = args.transaction, args.target
    c.journal.update(transaction=c.transaction, target_release=c.target, operation='production-recovery')
    with c.cluster_lock():
        reconcile(c, expected=(args.transaction, args.target),
                  inspect_only=not (args.recover or args.abort_untouched), abort_untouched=args.abort_untouched)


if __name__ == '__main__':
    main()
