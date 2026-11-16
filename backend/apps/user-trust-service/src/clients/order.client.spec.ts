import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { OrderClient } from './order.client.js';

describe('OrderClient', () => {
  let client: OrderClient;
  let configMock: any;

  beforeEach(() => {
    configMock = {
      get: vi.fn().mockReturnValue('http://localhost:3004'),
      upstreamTimeoutMs: 5000,
      internalServiceSecret: 'test-internal-secret',
    };
    client = new OrderClient(configMock);
  });

  it('throws BadRequestException for invalid UUID orderId', async () => {
    await expect(client.getOrder('not-a-uuid')).rejects.toThrow(BadRequestException);
  });

  it('successfully returns order details when order-service returns 200', async () => {
    const mockOrderData = {
      orderId: 'a0000000-0000-4000-8000-000000000001',
      orderCode: 'ORD-123',
      status: 'completed',
      customerUserId: 'user-c1',
      workerUserId: 'user-w1',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: mockOrderData }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.getOrder('a0000000-0000-4000-8000-000000000001');

    expect(result).toEqual(mockOrderData);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3004/api/v1/internal/orders/a0000000-0000-4000-8000-000000000001/payment-eligibility',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'test-internal-secret',
        },
      }),
    );
  });

  it('throws NotFoundException when order-service returns 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.getOrder('a0000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ServiceUnavailableException when fetch throws error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.getOrder('a0000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when order-service returns non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.getOrder('a0000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

