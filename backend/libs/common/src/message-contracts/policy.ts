import type { ChatEligibilitySnapshot } from './types.js';
/** Pure policy specification. Phase 2 must acquire and bind this snapshot on the server. */
export function chatPermissions(
  snapshot: ChatEligibilitySnapshot,
  userId: string,
): { create: boolean; read: boolean; send: boolean } {
  const denied = { create: false, read: false, send: false };
  if (
    !snapshot.userActive ||
    snapshot.customerId === snapshot.workerId ||
    (userId !== snapshot.customerId && userId !== snapshot.workerId)
  )
    return denied;
  const read = snapshot.conversationExists;
  if (!snapshot.verified) return { ...denied, read };
  const validBid =
    snapshot.bidStatus === 'active' || snapshot.bidStatus === 'selected';
  let allowed = false;
  if (
    validBid &&
    (!snapshot.selectedWorkerId ||
      snapshot.selectedWorkerId === snapshot.workerId)
  ) {
    if (
      snapshot.requestStatus === 'open_for_bidding' ||
      snapshot.requestStatus === 'bidding_closed'
    )
      allowed =
        snapshot.bidStatus === 'active' &&
        snapshot.bidCurrentlyValid === true &&
        snapshot.orderStatus === null;
    if (
      snapshot.requestStatus === 'converted_to_order' &&
      snapshot.selectedWorkerId === snapshot.workerId
    ) {
      allowed =
        [
          'created',
          'confirmed',
          'in_progress',
          'awaiting_customer_confirmation',
        ].includes(snapshot.orderStatus ?? '') ||
        (snapshot.orderStatus === 'completed' && snapshot.completionWindowOpen);
    }
  }
  return {
    create: allowed,
    read,
    send: allowed && snapshot.conversationExists,
  };
}

/** Server must additionally verify that incoming identifies an existing message (or zero). */
export function advanceReadSequence(
  current: string,
  incoming: string,
  highWater: string,
): string {
  const canonical = /^(0|[1-9][0-9]{0,18})$/;
  if (
    ![current, incoming, highWater].every(
      (value) => canonical.test(value) && BigInt(value) <= 9223372036854775807n,
    ) ||
    BigInt(incoming) > BigInt(highWater) ||
    BigInt(current) > BigInt(highWater)
  )
    throw new Error('INVALID_READ_CURSOR');
  return BigInt(incoming) > BigInt(current) ? incoming : current;
}
