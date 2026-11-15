import { describe, expect, it, vi } from 'vitest';
import { TopupIpnController, TopupsController } from './topups.controller.js';
import type { Request } from 'express';

describe('VNPAY browser return', () => {
  it('never interprets a browser redirect as a committed credit', () => {
    const handleIpn = vi.fn();
    const controller = new TopupIpnController({ handleIpn } as never);
    expect(controller.browserReturn()).toMatchObject({
      data: { confirmed: false, authenticationRequired: true },
    });
    expect(handleIpn).not.toHaveBeenCalled();
  });
});

describe('TopupsController client IP extraction', () => {
  it('extracts client IP from X-Forwarded-For header when present', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'topup-1' });
    const controller = new TopupsController({ create } as never);
    const user = { userId: 'a0000000-0000-4000-8000-000000000001', role: 'CUSTOMER' } as never;
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.195, 10.77.0.1' },
      ip: '10.77.0.1',
    } as unknown as Request;

    await controller.create(user, { amount: 50000, provider: 'VNPAY' } as never, req);
    expect(create).toHaveBeenCalledWith(
      'a0000000-0000-4000-8000-000000000001',
      { amount: 50000, provider: 'VNPAY' },
      '203.0.113.195',
    );
  });

  it('falls back to req.ip with ::ffff: stripped when X-Forwarded-For is absent', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'topup-2' });
    const controller = new TopupsController({ create } as never);
    const user = { userId: 'a0000000-0000-4000-8000-000000000001', role: 'CUSTOMER' } as never;
    const req = {
      headers: {},
      ip: '::ffff:192.168.1.50',
    } as unknown as Request;

    await controller.create(user, { amount: 50000, provider: 'VNPAY' } as never, req);
    expect(create).toHaveBeenCalledWith(
      'a0000000-0000-4000-8000-000000000001',
      { amount: 50000, provider: 'VNPAY' },
      '192.168.1.50',
    );
  });

  it('defaults to 127.0.0.1 when neither header nor ip is a valid IPv4', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'topup-3' });
    const controller = new TopupsController({ create } as never);
    const user = { userId: 'a0000000-0000-4000-8000-000000000001', role: 'CUSTOMER' } as never;
    const req = {
      headers: { 'x-forwarded-for': 'invalid-ip' },
      ip: 'not-an-ip',
    } as unknown as Request;

    await controller.create(user, { amount: 50000, provider: 'VNPAY' } as never, req);
    expect(create).toHaveBeenCalledWith(
      'a0000000-0000-4000-8000-000000000001',
      { amount: 50000, provider: 'VNPAY' },
      '127.0.0.1',
    );
  });
});
