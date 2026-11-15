import type { WalletCallResult } from './wallet.client.js';

export type DebitOutcome =
  | { kind: 'success' }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown' };

// Only a persisted terminal operation proves the outcome. HTTP validation,
// missing wallets and conflicts can also be observed on a replay.

export function interpretWalletStatus(status: unknown): DebitOutcome {
  if (status === 'completed') return { kind: 'success' };
  if (status === 'failed')
    return { kind: 'failed', reason: 'Wallet marked the operation as failed' };
  // pending/reversed/unknown values must be looked up again, never assumed.
  return { kind: 'unknown' };
}

export function interpretWalletResult(
  result: WalletCallResult<unknown> | { outcome: 'missing' },
): DebitOutcome {
  switch (result.outcome) {
    case 'ok':
      if (
        (result.data as { status?: unknown } | null)?.status === 'failed' &&
        (result.data as { failureCode?: unknown }).failureCode ===
          'INSUFFICIENT_FUNDS'
      ) {
        return { kind: 'failed', reason: 'INSUFFICIENT_FUNDS' };
      }
      return interpretWalletStatus(
        (result.data as { status?: unknown } | null)?.status,
      );
    case 'rejected':
      return { kind: 'unknown' };
    default:
      return { kind: 'unknown' };
  }
}
