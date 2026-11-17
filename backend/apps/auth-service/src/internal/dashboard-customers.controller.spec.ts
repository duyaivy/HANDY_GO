import { describe, expect, it, vi } from 'vitest';
import { DashboardCustomersController } from './dashboard-customers.controller.js';

describe('internal dashboard customer count', () => {
  it('counts historical customer registrations independently of current roles', async () => {
    const db = {
      customerRegistration: { count: vi.fn().mockResolvedValue(12) },
    };
    const controller = new DashboardCustomersController(
      db as never,
      { internalServiceSecret: 'shared-secret' } as never,
    );
    const result = await controller.registeredCustomers(
      '2026-11-15T08:00:00.000Z',
      'shared-secret',
    );
    expect(result.data).toBe(12);
    expect(db.customerRegistration.count).toHaveBeenCalledWith({
      where: {
        registeredAt: { lt: new Date('2026-11-15T08:00:00.000Z') },
      },
    });
  });

  it('rejects requests without the internal secret', async () => {
    const db = { customerRegistration: { count: vi.fn() } };
    const controller = new DashboardCustomersController(
      db as never,
      { internalServiceSecret: 'shared-secret' } as never,
    );
    await expect(
      controller.registeredCustomers('2026-11-15T08:00:00.000Z', 'wrong'),
    ).rejects.toThrow();
    expect(db.customerRegistration.count).not.toHaveBeenCalled();
  });
});
