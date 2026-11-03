import type { BookingProposal } from '../types/order.types';
import * as React from 'react';

type Pending = { proposalId?: string; expiresAt: number; baseline: string };
const CONFIRMATION_TIMEOUT_MS = 30000;
const snapshot = (proposals: BookingProposal[], workerId: string) => JSON.stringify(proposals.filter(p => p.workerUserId === workerId).map(p => [p.id, p.status]));

// Only unconfirmed writes are optimistic. Confirmed business state belongs to REST.
export function usePendingProposals(scope: string, proposals: BookingProposal[] = []) {
  const pending = React.useRef(new Map<string, Map<string, Pending>>());
  const [visible, setVisible] = React.useReducer(
    (_previous: Map<string, Map<string, Pending>>, next: Map<string, Map<string, Pending>>) => next,
    new Map<string, Map<string, Pending>>(),
  );
  const render = () => setVisible(new Map([...pending.current].map(([key, entries]) => [key, new Map(entries)])));
  const current = visible.get(scope);
  const proposedWorkerIds = new Set(proposals.filter(p => p.status === 'proposed').map(p => p.workerUserId));
  current?.forEach((_, workerId) => proposedWorkerIds.add(workerId));

  React.useEffect(() => {
    const entries = pending.current.get(scope);
    if (!entries)
      return;
    let changed = false;
    const now = Date.now();
    for (const [workerId, entry] of entries) {
      const confirmed = Number.isFinite(entry.expiresAt) && (entry.proposalId
        ? proposals.some(p => p.id === entry.proposalId)
        : snapshot(proposals, workerId) !== entry.baseline);
      if (confirmed || entry.expiresAt <= now) {
        entries.delete(workerId);
        changed = true;
      }
    }
    if (changed)
      render();
    const deadlines = [...entries.values()].map(entry => entry.expiresAt).filter(Number.isFinite);
    if (!deadlines.length)
      return;
    const timer = setTimeout(() => {
      for (const [workerId, entry] of entries) {
        if (entry.expiresAt <= Date.now())
          entries.delete(workerId);
      }
      render();
    }, Math.max(0, Math.min(...deadlines) - now));
    return () => clearTimeout(timer);
  });

  const begin = (workerId: string) => {
    let entries = pending.current.get(scope);
    if (!entries) {
      entries = new Map();
      pending.current.set(scope, entries);
    }
    if (entries.has(workerId) || proposals.some(p => p.workerUserId === workerId && p.status === 'proposed'))
      return false;
    entries.set(workerId, { expiresAt: Infinity, baseline: snapshot(proposals, workerId) });
    render();
    return true;
  };
  const confirm = (workerId: string, proposalId?: string) => {
    const entry = pending.current.get(scope)?.get(workerId);
    if (entry) {
      entry.proposalId = proposalId;
      entry.expiresAt = Date.now() + CONFIRMATION_TIMEOUT_MS;
      render();
    }
  };
  const fail = (workerId: string) => {
    pending.current.get(scope)?.delete(workerId);
    render();
  };
  return { proposedWorkerIds, begin, confirm, fail };
}
