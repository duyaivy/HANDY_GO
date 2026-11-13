import { describe, expect, it, vi } from 'vitest';
import { AuthSeedService } from './auth-seed.service.js';

describe('AuthSeedService Payment authorization', () => {
  it('provisions Payment permissions to Admin and excludes Customer/Worker', async () => {
    const db = {
      permission: { upsert: vi.fn(async ({ create }) => create) },
      role: { upsert: vi.fn(async ({ create }) => create) },
      permissionRole: { upsert: vi.fn() },
    };
    await new AuthSeedService(db as never).seed();
    const permissionIds = new Map(
      db.permission.upsert.mock.calls.map(([input]) => [
        input.create.code,
        input.create.id,
      ]),
    );
    const roles = new Map(
      db.role.upsert.mock.calls.map(([input]) => [
        input.create.code,
        input.create.id,
      ]),
    );
    for (const code of [
      'refund:approve',
      'refund:create',
      'refund:read:all',
      'commission:manage',
      'payment:reconcile',
      'payment:read:all',
      'payment:dlq:replay',
    ]) {
      const grants = db.permissionRole.upsert.mock.calls
        .map(([input]) => input.create)
        .filter((grant) => grant.permissionId === permissionIds.get(code));
      expect(grants).toHaveLength(1);
      expect(grants[0].roleId).toBe(roles.get('ADMIN'));
    }
  });
});
