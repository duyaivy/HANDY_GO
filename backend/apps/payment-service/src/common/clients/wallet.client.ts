import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@app/config';

// `rejected` = HTTP 4xx; this does not prove the operation failed.
// `unknown`  = timeout/5xx/network – outcome must be looked up, never assumed.
export type WalletCallResult<T = Record<string, unknown>> =
  | { outcome: 'ok'; data: T; status: number }
  | { outcome: 'rejected'; status: number; message: string }
  | { outcome: 'unknown'; message: string };

export interface WalletOperationStatus {
  operationId: string;
  status: string;
  transferId?: string;
  kind?: string;
  amount?: string;
  failureCode?: string;
}

@Injectable()
export class WalletClient {
  private readonly logger = new Logger(WalletClient.name);

  constructor(private readonly config: ConfigService) {}

  debitPayment(
    customerId: string,
    body: { paymentId: string; attemptId: string; workerUserId: string; grossAmount: string; workerEarning: string; platformFee: string },
  ) {
    return this.post(`/internal/wallets/${customerId}/debit-payment`, body);
  }

  async getOperation(operationId: string): Promise<WalletCallResult<WalletOperationStatus> | { outcome: 'missing' }> {
    const result = await this.call<WalletOperationStatus>('GET', `/internal/wallets/operations/${operationId}`);
    if (result.outcome === 'rejected' && result.status === 404) return { outcome: 'missing' };
    return result;
  }

  refundCredit(userId: string, body: { paymentId: string; refundId: string; amount: string; method: 'point' | 'cash'; grossAmount: string }) {
    return this.post(`/internal/wallets/${userId}/refund-credit`, body);
  }

  collectCommission(body: { paymentId: string; workerUserId: string; amount: string; idempotencyKey: string }) {
    return this.post('/internal/wallets/commission/collect', body);
  }

  claimWithdrawal(withdrawalId: string, body: { payoutOperationId: string; payoutReference?: string }) {
    return this.post(`/internal/withdrawals/${withdrawalId}/claim`, body);
  }

  finishWithdrawal(withdrawalId: string, body: { payoutOperationId: string; status: 'succeeded' | 'failed' | 'cancelled' }) {
    return this.post(`/internal/withdrawals/${withdrawalId}/status`, body);
  }

  private post(path: string, body: unknown) {
    return this.call<Record<string, unknown>>('POST', path, body);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<WalletCallResult<T>> {
    const secret = this.config.internalServiceSecret;
    const timeoutMs = this.config.upstreamTimeoutMs;
    let url: URL;
    try {
      const base = this.config.getUrl('WALLET_SERVICE_URL').replace(/\/+$/, '');
      const prefix = this.config.apiPrefix.replace(/^\/+|\/+$/g, '');
      url = new URL(`${base.endsWith(`/${prefix}`) ? base : `${base}/${prefix}`}${path}`);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      return { outcome: 'unknown', message: 'Wallet service URL is not configured correctly' };
    }
    if (!secret || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      return { outcome: 'unknown', message: 'Wallet service client is not configured' };
    }

    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers: {
          'x-internal-secret': secret,
          'x-forwarded-for': '127.0.0.1',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        signal: AbortSignal.timeout(timeoutMs),
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      response = await fetch(url, init);
    } catch (error) {
      this.logger.warn(`Wallet request failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return { outcome: 'unknown', message: 'Wallet service is unreachable' };
    }

    if (response.status >= 500) return { outcome: 'unknown', message: `Wallet service returned HTTP ${response.status}` };
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (response.status >= 400) {
      const message =
        json && typeof json === 'object' && typeof (json as { message?: unknown }).message === 'string'
          ? (json as { message: string }).message
          : `Wallet service returned HTTP ${response.status}`;
      return { outcome: 'rejected', status: response.status, message };
    }
    const data = (json && typeof json === 'object' && 'data' in json ? (json as { data: unknown }).data : json) as T;
    if (!data || typeof data !== 'object') return { outcome: 'unknown', message: 'Wallet service returned an invalid response' };
    return { outcome: 'ok', data, status: response.status };
  }
}
