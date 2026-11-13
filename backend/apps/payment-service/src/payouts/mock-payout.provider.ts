import { Injectable } from '@nestjs/common';
import { BankSnapshotProvider, PayoutProvider, type PayoutProviderResult, type PayoutRequest } from './payout-provider.js';

// Simulated outcomes only: no real bank transfer ever happens. It is off unless explicitly enabled
// outside production, so a misconfigured deployment cannot pretend to pay out.
@Injectable()
export class MockPayoutProvider extends PayoutProvider {
  readonly name = 'mock';
  readonly simulated = true;

  isEnabled(): boolean {
    return process.env.PAYOUT_MOCK_ENABLED?.trim().toLowerCase() === 'true' && process.env.NODE_ENV !== 'production';
  }

  async send(request: PayoutRequest): Promise<PayoutProviderResult> {
    const mode = process.env.PAYOUT_MOCK_OUTCOME?.trim().toLowerCase();
    if (mode === 'failed') return { outcome: 'failed', reason: 'Simulated payout failure' };
    if (mode === 'unknown') return { outcome: 'unknown' };
    return { outcome: 'succeeded', reference: `MOCK-${request.payoutId}` };
  }
}

@Injectable()
export class UnavailableBankSnapshotProvider extends BankSnapshotProvider {
  async fetch(): Promise<Record<string, unknown> | null> {
    return null;
  }
}
