export interface PayoutRequest {
  payoutId: string;
  amountVnd: bigint;
  bankAccountSnapshot: Record<string, unknown>;
}

export type PayoutProviderResult =
  | { outcome: 'succeeded'; reference: string }
  | { outcome: 'failed'; reason: string }
  | { outcome: 'unknown' };

export abstract class PayoutProvider {
  abstract readonly name: string;
  abstract readonly simulated: boolean;
  abstract isEnabled(): boolean;
  abstract send(request: PayoutRequest): Promise<PayoutProviderResult>;
}

// Source of the validated, immutable bank destination. No source is approved yet, so the
// default implementation reports "unavailable" and payouts are never dispatched without it.
export abstract class BankSnapshotProvider {
  abstract fetch(userId: string, bankAccountId: string): Promise<Record<string, unknown> | null>;
}
