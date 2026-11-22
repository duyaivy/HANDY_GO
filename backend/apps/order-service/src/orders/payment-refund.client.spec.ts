import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@app/config';
import { PaymentRefundClient } from './payment-refund.client.js';

const orderId = randomUUID();
const paymentId = randomUUID();

function createConfig(overrides: Partial<{
  internalServiceSecret: string;
  apiPrefix: string;
  upstreamTimeoutMs: number;
  baseUrl: string;
}> = {}): ConfigService {
  const {
    internalServiceSecret = 'shared-internal-secret',
    apiPrefix = 'api/v1',
    upstreamTimeoutMs = 3000,
    baseUrl = 'http://payment-service:3006',
  } = overrides;
  return {
    internalServiceSecret,
    apiPrefix,
    upstreamTimeoutMs,
    getUrl: vi.fn(() => baseUrl),
  } as unknown as ConfigService;
}

describe('PaymentRefundClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws ServiceUnavailableException when internalServiceSecret is missing', async () => {
    const client = new PaymentRefundClient(
      createConfig({ internalServiceSecret: '' }),
    );

    await expect(client.byOrder(orderId)).rejects.toThrowError(
      new ServiceUnavailableException(
        'Payment internal authentication is not configured',
      ),
    );
  });

  it.each(['not-a-valid-url', 'ftp://payment-service:3006'])(
    'throws ServiceUnavailableException when PAYMENT_SERVICE_URL is invalid (%s)',
    async (baseUrl) => {
      const client = new PaymentRefundClient(createConfig({ baseUrl }));

      await expect(client.byOrder(orderId)).rejects.toThrowError(
        new ServiceUnavailableException('Payment URL is invalid'),
      );
    },
  );

  it('throws ServiceUnavailableException when fetch fails due to network error or timeout', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      }),
    );
    const client = new PaymentRefundClient(createConfig());

    await expect(client.byOrder(orderId)).rejects.toThrowError(
      new ServiceUnavailableException('Payment is unreachable'),
    );
  });

  it.each([401, 404, 500, 503])(
    'throws ServiceUnavailableException when upstream returns non-200 HTTP status %d',
    async (status) => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'error' }), { status }),
      );
      const client = new PaymentRefundClient(createConfig());

      await expect(client.byOrder(orderId)).rejects.toThrowError(
        new ServiceUnavailableException('Payment refundability is unavailable'),
      );
    },
  );

  it.each([
    ['invalid JSON body', () => new Response('not-json', { status: 200 })],
    ['missing data field', () => new Response(JSON.stringify({}), { status: 200 })],
    [
      'non-UUID paymentId',
      () =>
        new Response(
          JSON.stringify({
            data: {
              paymentId: 'not-a-uuid',
              status: 'succeeded',
              refundableAmountVnd: '100000',
            },
          }),
          { status: 200 },
        ),
    ],
    [
      'negative refundableAmountVnd',
      () =>
        new Response(
          JSON.stringify({
            data: {
              paymentId,
              status: 'succeeded',
              refundableAmountVnd: '-1',
            },
          }),
          { status: 200 },
        ),
    ],
    [
      'decimal refundableAmountVnd',
      () =>
        new Response(
          JSON.stringify({
            data: {
              paymentId,
              status: 'succeeded',
              refundableAmountVnd: '100.5',
            },
          }),
          { status: 200 },
        ),
    ],
    [
      'leading-zero refundableAmountVnd',
      () =>
        new Response(
          JSON.stringify({
            data: {
              paymentId,
              status: 'succeeded',
              refundableAmountVnd: '01',
            },
          }),
          { status: 200 },
        ),
    ],
  ])(
    'throws ServiceUnavailableException when response has %s',
    async (_case, buildResponse) => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(buildResponse());
      const client = new PaymentRefundClient(createConfig());

      await expect(client.byOrder(orderId)).rejects.toThrowError(
        new ServiceUnavailableException('Payment response is invalid'),
      );
    },
  );

  it('returns parsed Refundability, sends x-internal-secret header, and avoids duplicating apiPrefix', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            paymentId,
            status: 'succeeded',
            refundableAmountVnd: '250000',
          },
        }),
        { status: 200 },
      ),
    );
    const client = new PaymentRefundClient(
      createConfig({ baseUrl: 'http://payment-service:3006/api/v1/' }),
    );

    const result = await client.byOrder(orderId);

    expect(result).toEqual({
      paymentId,
      status: 'succeeded',
      refundableAmountVnd: 250000n,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect((calledUrl as URL).toString()).toBe(
      `http://payment-service:3006/api/v1/internal/payments/order/${orderId}/refundable`,
    );
    expect(calledInit?.headers).toEqual({
      'x-internal-secret': 'shared-internal-secret',
    });
  });
});
