import { Injectable } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { BankSnapshotProvider } from './payout-provider.js';

/** Only a destination marker for simulated payouts; never returns bank credentials. */
@Injectable()
export class SandboxBankSnapshotProvider extends BankSnapshotProvider {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async fetch(
    userId: string,
    bankAccountId: string,
  ): Promise<Record<string, unknown> | null> {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.PAYOUT_MOCK_ENABLED !== 'true'
    )
      return null;
    if (!this.config.internalServiceSecret) return null;
    const base = this.config
      .getUrl('USER_TRUST_SERVICE_URL')
      .replace(/\/+$/, '');
    const prefix = this.config.apiPrefix.replace(/^\/+|\/+$/g, '');
    const url = `${base.endsWith(`/${prefix}`) ? base : `${base}/${prefix}`}/internal/users/verify-bank-account`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': this.config.internalServiceSecret,
      },
      body: JSON.stringify({ userId, bankAccountId }),
      signal: AbortSignal.timeout(this.config.upstreamTimeoutMs),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      owned?: unknown;
      active?: unknown;
    };
    return body?.owned === true && body.active === true
      ? { userId, bankAccountId, provider: 'mock', isSimulated: true }
      : null;
  }
}
