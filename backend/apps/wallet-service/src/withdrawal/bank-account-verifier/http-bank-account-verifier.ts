import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { ConfigService } from '@app/config';
import { BankAccountVerifier } from './bank-account-verifier.port.js';

const VERIFY_PATH = 'internal/users/verify-bank-account';

/**
 * Gọi User Trust qua HTTP internal. Trả false chỉ khi User Trust trả lời rõ ràng là tài khoản
 * không thuộc user/không active. Mọi lỗi hạ tầng (timeout, mạng, non-2xx, body sai) ném 503 để caller
 * phân biệt "bị từ chối" với "chưa xác minh được" và có thể retry.
 */
@Injectable()
export class HttpBankAccountVerifier implements BankAccountVerifier {
  constructor(private readonly config: ConfigService) {}

  /** `${USER_TRUST_SERVICE_URL}/${API_PREFIX}/internal/users/verify-bank-account`. */
  buildUrl(): string {
    const base = this.config.getUrl('USER_TRUST_SERVICE_URL').replace(/\/+$/, '');
    const prefix = this.config.apiPrefix.replace(/^\/+|\/+$/g, '');
    return [base, prefix, VERIFY_PATH].filter(Boolean).join('/');
  }

  async verify(userId: string, bankAccountId: string): Promise<boolean> {
    let url: string;
    try {
      url = this.buildUrl();
    } catch {
      throw this.unavailable('USER_TRUST_SERVICE_URL is not configured');
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
      if (!response.ok) throw this.unavailable(`User Trust responded ${response.status}`);
      const result: unknown = await response.json();
      const { owned, active } = (typeof result === 'object' && result !== null ? result : {}) as { owned?: unknown; active?: unknown };
      if (typeof owned !== 'boolean' || typeof active !== 'boolean') throw this.unavailable('User Trust returned an invalid body');
      return owned && active;
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw this.unavailable('User Trust is unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable(message: string): AppException {
    return new AppException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODES.DEPENDENCY_UNAVAILABLE, `Bank account verification unavailable: ${message}`);
  }
}
