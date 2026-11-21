import { HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { isUUID } from 'class-validator';

export interface Refundability { paymentId: string | null; status: string; refundableAmountVnd: bigint }

@Injectable()
export class PaymentRefundClient {
  constructor(private readonly config: ConfigService) {}

  async byOrder(orderId: string): Promise<Refundability> {
    const secret = this.config.internalServiceSecret;
    if (!secret) throw new ServiceUnavailableException('Payment internal authentication is not configured');
    let url: URL;
    try {
      const base = this.config.getUrl('PAYMENT_SERVICE_URL').replace(/\/+$/, '');
      const prefix = this.config.apiPrefix.replace(/^\/+|\/+$/g, '');
      url = new URL(`${base.endsWith(`/${prefix}`) ? base : `${base}/${prefix}`}/internal/payments/order/${orderId}/refundable`);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch { throw new ServiceUnavailableException('Payment URL is invalid'); }
    let response: Response;
    try {
      response = await fetch(url, { headers: { 'x-internal-secret': secret }, signal: AbortSignal.timeout(this.config.upstreamTimeoutMs) });
    } catch { throw new ServiceUnavailableException('Payment is unreachable'); }
    if (response.status !== HttpStatus.OK) throw new ServiceUnavailableException('Payment refundability is unavailable');
    let data: unknown;
    try { data = (await response.json() as { data?: unknown }).data; }
    catch { throw new ServiceUnavailableException('Payment response is invalid'); }
    if (!data || typeof data !== 'object') throw new ServiceUnavailableException('Payment response is invalid');
    const value = data as Record<string, unknown>;
    if ((value.paymentId !== null && (typeof value.paymentId !== 'string' || !isUUID(value.paymentId))) ||
        typeof value.status !== 'string' || typeof value.refundableAmountVnd !== 'string' ||
        !/^(0|[1-9][0-9]*)$/.test(value.refundableAmountVnd)) {
      throw new ServiceUnavailableException('Payment response is invalid');
    }
    return { paymentId: value.paymentId as string | null, status: value.status, refundableAmountVnd: BigInt(value.refundableAmountVnd) };
  }
}
