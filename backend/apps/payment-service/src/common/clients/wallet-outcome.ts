import type { WalletCallResult } from './wallet.client.js';

export type DebitOutcome =
  | { kind: 'success' }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown' };

// HTTP statuses that say nothing about whether the debit itself was refused.
const INCONCLUSIVE_REJECTIONS = new Set([401, 403, 408, 429]);

export function interpretWalletStatus(status: unknown): DebitOutcome {
  if (status === 'completed') return { kind: 'success' };
  if (status === 'failed') return { kind: 'failed', reason: 'Wallet marked the operation as failed' };
  // pending/reversed/unknown values must be looked up again, never assumed.
  return { kind: 'unknown' };
}

export function interpretWalletResult(result: WalletCallResult<unknown> | { outcome: 'missing' }): DebitOutcome {
  switch (result.outcome) {
    case 'ok':
      return interpretWalletStatus((result.data as { status?: unknown } | null)?.status);
    case 'rejected':
      if (INCONCLUSIVE_REJECTIONS.has(result.status)) return { kind: 'unknown' };
      return { kind: 'failed', reason: result.message.slice(0, 200) };
    default:
      return { kind: 'unknown' };
  }
}
