import type { BookingProposal, BookingProposalStatus } from '@/features/orders/types/order.types';

/**
 * Resolves the currently active / most relevant proposal for a given worker.
 *
 * Rules:
 * 1. If any proposal is finalized (order created), it takes absolute precedence.
 * 2. Ancestor proposals superseded by a newer revision in the same chain are never active leaves.
 * 3. In the same revision chain, descendant proposals supersede ancestor proposals.
 * 4. Active proposals ('proposed', 'changes_requested') take precedence over dead / terminal
 *    proposals ('worker_rejected', 'withdrawn', 'expired', 'superseded') from older chains.
 * 5. Between proposals of the same activity tier, the more recently created one (createdAt) wins.
 * 6. Revision number is NOT used as a global sorting key across unrelated proposal chains.
 * 7. Deterministic tie-breakers ensure consistent behavior regardless of API response order.
 */
export function resolveLatestProposal(
  proposals: BookingProposal[] | undefined | null,
  workerUserId: string,
): BookingProposal | null {
  if (!proposals || proposals.length === 0) {
    return null;
  }

  const workerProposals = proposals.filter(p => p.workerUserId === workerUserId);
  if (workerProposals.length === 0) {
    return null;
  }
  if (workerProposals.length === 1) {
    return workerProposals[0];
  }

  // 1. Finalized proposal always wins (deal was sealed)
  const finalizedList = workerProposals.filter(p => p.status === 'finalized');
  if (finalizedList.length > 0) {
    if (finalizedList.length === 1) {
      return finalizedList[0];
    }
    return [...finalizedList].sort((a, b) => {
      const timeA = new Date(a.finalizedAt || a.createdAt).getTime();
      const timeB = new Date(b.finalizedAt || b.createdAt).getTime();
      return timeB - timeA;
    })[0];
  }

  // 2. Build supersession ancestry map
  const supersededIds = new Set<string>();
  const parentMap = new Map<string, string>();

  for (const p of workerProposals) {
    if (p.supersedesProposalId) {
      supersededIds.add(p.supersedesProposalId);
      parentMap.set(p.id, p.supersedesProposalId);
    }
    if (p.status === 'superseded') {
      supersededIds.add(p.id);
    }
  }

  const isDescendantOf = (descendantId: string, ancestorId: string): boolean => {
    let curr: string | undefined = descendantId;
    const visited = new Set<string>();
    while (curr && !visited.has(curr)) {
      visited.add(curr);
      const parent = parentMap.get(curr);
      if (!parent) {
        return false;
      }
      if (parent === ancestorId) {
        return true;
      }
      curr = parent;
    }
    return false;
  };

  // Filter out superseded proposals to find active chain leaves
  const leaves = workerProposals.filter(p => !supersededIds.has(p.id));
  const candidates = leaves.length > 0 ? leaves : workerProposals;

  if (candidates.length === 1) {
    return candidates[0];
  }

  const isLiveStatus = (status: BookingProposalStatus): boolean => {
    return status === 'proposed' || status === 'changes_requested';
  };

  const getStatusPriority = (status: BookingProposalStatus): number => {
    switch (status) {
      case 'finalized':
        return 4;
      case 'proposed':
        return 3;
      case 'changes_requested':
        return 2;
      default:
        return 1;
    }
  };

  const sorted = [...candidates].sort((a, b) => {
    // A. Same chain: descendant always beats ancestor
    if (isDescendantOf(a.id, b.id)) {
      return -1;
    }
    if (isDescendantOf(b.id, a.id)) {
      return 1;
    }

    // B. Live negotiation proposals beat dead / terminal proposals
    const liveA = isLiveStatus(a.status) ? 1 : 0;
    const liveB = isLiveStatus(b.status) ? 1 : 0;
    if (liveA !== liveB) {
      return liveB - liveA;
    }

    // C. Timestamp: newer createdAt wins
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeB - timeA;
    }

    // D. Specific status priority (proposed > changes_requested)
    const prioA = getStatusPriority(a.status);
    const prioB = getStatusPriority(b.status);
    if (prioA !== prioB) {
      return prioB - prioA;
    }

    // E. updatedAt timestamp
    const updateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const updateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    if (!Number.isNaN(updateA) && !Number.isNaN(updateB) && updateA !== updateB) {
      return updateB - updateA;
    }

    // F. revisionNo within same tier
    if (b.revisionNo !== a.revisionNo) {
      return b.revisionNo - a.revisionNo;
    }

    // G. Deterministic ID tie-breaker
    return b.id.localeCompare(a.id);
  });

  return sorted[0];
}
