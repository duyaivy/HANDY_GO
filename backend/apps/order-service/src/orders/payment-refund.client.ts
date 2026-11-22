import { HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { isUUID } from 'class-validator';

export interface Refundability {
  paymentId: string | null;
  status: string;
  refundableAmountVnd: bigint;
}

export type DisputeRefundOverrideOutcome =
  | 'no_refund'
  | 'already_terminal'
  | 'cancelled'
  | 'already_completed'
  | 'refund_in_progress'
  | 'wallet_uncertain';

export interface DisputeRefundOverrideCheck {
  safeToOverride: boolean;
  outcome: DisputeRefundOverrideOutcome;
  refundId: string | null;
  refundStatus: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  refundAmountVnd: string | null;
}

const VALID_OVERRIDE_OUTCOMES = new Set<DisputeRefundOverrideOutcome>([
  'no_refund',
  'already_terminal',
  'cancelled',
  'already_completed',
  'refund_in_progress',
  'wallet_uncertain',
]);

@Injectable()
export class PaymentRefundClient {
  constructor(private readonly config: ConfigService) {}

  private buildInternalUrl(path: string): { url: URL; secret: string } {
    const secret = this.config.internalServiceSecret;
    if (!secret) {
      throw new ServiceUnavailableException(
        'Payment internal authentication is not configured',
      );
    }
    try {
      const base = this.config.getUrl('PAYMENT_SERVICE_URL').replace(/\/+$/, '');
      const prefix = this.config.apiPrefix.replace(/^\/+|\/+$/g, '');
      const url = new URL(
        `${base.endsWith(`/${prefix}`) ? base : `${base}/${prefix}`}${path}`,
      );
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('protocol');
      }
      return { url, secret };
    } catch {
      throw new ServiceUnavailableException('Payment URL is invalid');
    }
  }

  async byOrder(orderId: string): Promise<Refundability> {
    const { url, secret } = this.buildInternalUrl(
      `/internal/payments/order/${orderId}/refundable`,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'x-internal-secret': secret },
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('Payment is unreachable');
    }
    if (response.status !== HttpStatus.OK) {
      throw new ServiceUnavailableException(
        'Payment refundability is unavailable',
      );
    }
    let data: unknown;
    try {
      data = ((await response.json()) as { data?: unknown }).data;
    } catch {
      throw new ServiceUnavailableException('Payment response is invalid');
    }
    if (!data || typeof data !== 'object') {
      throw new ServiceUnavailableException('Payment response is invalid');
    }
    const value = data as Record<string, unknown>;
    if (
      (value.paymentId !== null &&
        (typeof value.paymentId !== 'string' || !isUUID(value.paymentId))) ||
      typeof value.status !== 'string' ||
      typeof value.refundableAmountVnd !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(value.refundableAmountVnd)
    ) {
      throw new ServiceUnavailableException('Payment response is invalid');
    }
    return {
      paymentId: value.paymentId as string | null,
      status: value.status,
      refundableAmountVnd: BigInt(value.refundableAmountVnd),
    };
  }

  async cancelDisputeRefundForOverride(
    resolutionId: string,
    body: { orderId: string; adminUserId: string; reason: string },
  ): Promise<DisputeRefundOverrideCheck> {
    const { url, secret } = this.buildInternalUrl(
      `/internal/payments/dispute-resolutions/${resolutionId}/cancel-for-override`,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-internal-secret': secret,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('Payment is unreachable');
    }
    if (response.status !== HttpStatus.OK) {
      throw new ServiceUnavailableException(
        'Payment override reconciliation is unavailable',
      );
    }
    let data: unknown;
    try {
      data = ((await response.json()) as { data?: unknown }).data;
    } catch {
      throw new ServiceUnavailableException('Payment response is invalid');
    }
    if (!data || typeof data !== 'object') {
      throw new ServiceUnavailableException('Payment response is invalid');
    }
    const value = data as Record<string, unknown>;
    const validNullableUuid = (v: unknown) =>
      v === null || (typeof v === 'string' && isUUID(v));
    const validNullableString = (v: unknown) =>
      v === null || typeof v === 'string';
    if (
      typeof value.safeToOverride !== 'boolean' ||
      typeof value.outcome !== 'string' ||
      !VALID_OVERRIDE_OUTCOMES.has(
        value.outcome as DisputeRefundOverrideOutcome,
      ) ||
      !validNullableUuid(value.refundId) ||
      !validNullableString(value.refundStatus) ||
      !validNullableUuid(value.paymentId) ||
      !validNullableString(value.paymentStatus) ||
      (value.refundAmountVnd !== null &&
        (typeof value.refundAmountVnd !== 'string' ||
          !/^[1-9][0-9]*$/.test(value.refundAmountVnd)))
    ) {
      throw new ServiceUnavailableException('Payment response is invalid');
    }
    return {
      safeToOverride: value.safeToOverride,
      outcome: value.outcome as DisputeRefundOverrideOutcome,
      refundId: value.refundId as string | null,
      refundStatus: value.refundStatus as string | null,
      paymentId: value.paymentId as string | null,
      paymentStatus: value.paymentStatus as string | null,
      refundAmountVnd: value.refundAmountVnd as string | null,
    };
  }
}
