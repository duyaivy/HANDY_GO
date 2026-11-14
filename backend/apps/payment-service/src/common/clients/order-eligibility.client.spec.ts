import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@app/config';
import { OrderEligibilityClient } from './order-eligibility.client.js';

const orderId = randomUUID();
const customerUserId = randomUUID();
const workerUserId = randomUUID();
const valid = {
  orderId,
  customerUserId,
  workerUserId,
  status: 'completed',
  completedAt: '2026-11-01T00:00:00.000Z',
  paymentState: 'unpaid',
  agreedPrice: '350000.00',
  currency: 'VND',
  isEligibleForSettlement: true,
};

function client(overrides: Partial<ConfigService> = {}) {
  const config = {
    getUrl: () => 'http://order-service:3004',
    apiPrefix: 'api/v1',
    internalServiceSecret: 'test-secret',
    upstreamTimeoutMs: 1000,
    ...overrides,
  } as ConfigService;
  return new OrderEligibilityClient(config);
}

afterEach(() => vi.unstubAllGlobals());

describe('OrderEligibilityClient', () => {
  it('uses the trusted internal endpoint and preserves the exact VND amount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: valid }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client().getEligibility(orderId)).resolves.toMatchObject({
      orderId, customerUserId, workerUserId, amount: 350000n, isEligibleForSettlement: true, completedAt: new Date(valid.completedAt),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`http://order-service:3004/api/v1/internal/orders/${orderId}/payment-eligibility`),
      expect.objectContaining({ method: 'GET', headers: { 'x-internal-secret': 'test-secret' } }),
    );
  });

  it('does not duplicate the API prefix in configured URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: valid }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await client({ getUrl: () => 'http://order-service:3004/api/v1/' }).getEligibility(orderId);
    expect(fetchMock.mock.calls[0][0].toString()).toContain('/api/v1/internal/orders/');
    expect(fetchMock.mock.calls[0][0].toString()).not.toContain('/api/v1/api/v1/');
  });

  it.each([
    { ...valid, orderId: randomUUID() },
    { ...valid, customerUserId: workerUserId },
    { ...valid, agreedPrice: '1.50' },
    { ...valid, currency: 'USD' },
    { ...valid, isEligibleForSettlement: 'true' },
    { ...valid, status: 'created' },
    { ...valid, paymentState: 'paid' },
  ])('fails closed on invalid Order response', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 })));
    await expect(client().getEligibility(orderId)).rejects.toMatchObject({ status: 503 });
  });

  it('preserves an explicit ineligible result without treating it as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ...valid, status: 'created', isEligibleForSettlement: false } }), { status: 200 })));
    await expect(client().getEligibility(orderId)).resolves.toMatchObject({ status: 'created', isEligibleForSettlement: false });
  });

  it('fails closed when the secret is missing, upstream errors or the response is malformed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(client({ internalServiceSecret: '' }).getEligibility(orderId)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(client().getEligibility(orderId)).rejects.toMatchObject({ status: 503 });
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    await expect(client().getEligibility(orderId)).rejects.toMatchObject({ status: 503 });
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    await expect(client().getEligibility(orderId)).rejects.toMatchObject({ status: 503 });
  });

  it('distinguishes an unknown order and rejects invalid input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(client().getEligibility(orderId)).rejects.toMatchObject({ status: 404 });
    await expect(client().getEligibility('not-a-uuid')).rejects.toMatchObject({ status: 400 });
  });
});
