import { describe, expect, it, vi } from 'vitest';
import { DashboardCustomersController } from './dashboard-customers.controller.js';

describe('internal dashboard customer count', () => {
  it('counts current customer-role accounts registered before the selected cutoff', async () => {
    const db = { account: { count: vi.fn().mockResolvedValue(12) } };
    const controller = new DashboardCustomersController(
      db as never,
      { internalServiceSecret: 'shared-secret' } as never,
    );
    const result = await controller.registeredCustomers(
      '2026-11-15T08:00:00.000Z',
      'shared-secret',
    );
    expect(result.data).toBe(12);
    expect(db.account.count).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-11-15T08:00:00.000Z') },
        roles: {
          some: {
            assignedAt: { lt: new Date('2026-11-15T08:00:00.000Z') },
            role: { code: 'CUSTOMER' },
          },
        },
      },
    });
  });

  it('rejects requests without the internal secret', async () => {
    const db = { account: { count: vi.fn() } };
    const controller = new DashboardCustomersController(
      db as never,
      { internalServiceSecret: 'shared-secret' } as never,
    );
    await expect(
      controller.registeredCustomers('2026-11-15T08:00:00.000Z', 'wrong'),
    ).rejects.toThrow();
    expect(db.account.count).not.toHaveBeenCalled();
  });
});
