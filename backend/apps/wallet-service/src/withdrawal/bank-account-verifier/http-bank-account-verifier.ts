import { Injectable } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { BankAccountVerifier } from './bank-account-verifier.port.js';

@Injectable()
export class HttpBankAccountVerifier implements BankAccountVerifier {
  constructor(private readonly config: ConfigService) {}

  async verify(userId: string, bankAccountId: string): Promise<boolean> {
    let url: string;
    try {
      url = this.config.getUrl('BANK_ACCOUNT_VERIFIER_URL');
    } catch {
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.upstreamTimeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': this.config.internalServiceSecret },
        body: JSON.stringify({ userId, bankAccountId }),
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const result: unknown = await response.json();
      return typeof result === 'object' && result !== null && (result as { owned?: unknown }).owned === true && (result as { active?: unknown }).active === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
