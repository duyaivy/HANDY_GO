import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { ConfigService } from '@app/config';
import { isUUID } from 'class-validator';
import { parseOrderAmount } from '../money/payment-money.js';

export interface OrderPaymentEligibility {
  orderId: string;
  customerUserId: string;
  workerUserId: string;
  status: string;
  paymentState: string;
  amount: bigint;
  currency: 'VND';
  isEligibleForSettlement: boolean;
  completedAt?: Date | null;
}

@Injectable()
export class OrderEligibilityClient {
  private readonly logger = new Logger(OrderEligibilityClient.name);

  constructor(private readonly config: ConfigService) {}

  async getEligibility(orderId: string): Promise<OrderPaymentEligibility> {
    if (!isUUID(orderId)) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Invalid order ID');
    }

    const secret = this.config.internalServiceSecret;
    if (!secret) throw this.unavailable('Order service authentication is not configured');

    let url: URL;
    try {
      const base = this.config.getUrl('ORDER_SERVICE_URL').replace(/\/+$/, '');
      const prefix = this.config.apiPrefix.replace(/^\/+|\/+$/g, '');
      const baseWithPrefix = base.endsWith(`/${prefix}`) ? base : `${base}/${prefix}`;
      url = new URL(`${baseWithPrefix}/internal/orders/${orderId}/payment-eligibility`);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    } catch {
      this.logger.error('Order service URL configuration is invalid');
      throw this.unavailable('Order service URL is not configured correctly');
    }

    const timeoutMs = this.config.upstreamTimeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw this.unavailable('Order service timeout is not configured correctly');
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'x-internal-secret': secret },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.logger.error(`Order service request failed: ${error instanceof Error ? error.name : 'unknown error'}`);
      throw this.unavailable('Order service is unreachable');
    }

    if (response.status === 404) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Order not found');
    }
    if (!response.ok) {
      this.logger.error(`Order service returned HTTP ${response.status}`);
      throw this.unavailable('Order service could not verify payment eligibility');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw this.unavailable('Order service returned an invalid response');
    }
    if (!body || typeof body !== 'object' || !('data' in body)) {
      throw this.unavailable('Order service returned an invalid response');
    }
    const data: unknown = body.data;
    if (!data || typeof data !== 'object') throw this.unavailable('Order service returned an invalid response');
    const fields = data as Record<string, unknown>;
    if (
      fields.orderId !== orderId ||
      typeof fields.customerUserId !== 'string' || !isUUID(fields.customerUserId) ||
      typeof fields.workerUserId !== 'string' || !isUUID(fields.workerUserId) ||
      fields.customerUserId === fields.workerUserId ||
      typeof fields.status !== 'string' || fields.status.length === 0 ||
      typeof fields.paymentState !== 'string' || fields.paymentState.length === 0 ||
      fields.currency !== 'VND' ||
      typeof fields.isEligibleForSettlement !== 'boolean' ||
      (fields.isEligibleForSettlement && (fields.status !== 'completed' || fields.paymentState === 'paid')) ||
      typeof fields.agreedPrice !== 'string'
    ) {
      throw this.unavailable('Order service returned an invalid eligibility contract');
    }
    let amount: bigint;
    try {
      amount = parseOrderAmount(fields.agreedPrice);
    } catch {
      throw this.unavailable('Order service returned an invalid VND amount');
    }
    return {
      orderId,
      customerUserId: fields.customerUserId,
      workerUserId: fields.workerUserId,
      status: fields.status,
      paymentState: fields.paymentState,
      amount,
      currency: 'VND',
      isEligibleForSettlement: fields.isEligibleForSettlement,
      completedAt: typeof fields.completedAt === 'string' && !Number.isNaN(Date.parse(fields.completedAt)) ? new Date(fields.completedAt) : null,
    };
  }

  private unavailable(message: string): AppException {
    return new AppException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODES.DEPENDENCY_UNAVAILABLE, message);
  }
}
