import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@app/config';
import { AuthPrismaService } from '@app/database';
import { AuthClient } from '../../../user-trust-service/src/clients/auth.client.js';
import { UserContactController } from './user-contact.controller.js';

describe('internal user contact', () => {
  const userId = '00000000-0000-4000-8000-000000000002';

  function setup(phone: string | null = '+84912345678') {
    const db = { account: { findFirst: vi.fn().mockResolvedValue({ phone }) } };
    const controller = new UserContactController(db as never, { internalServiceSecret: 'shared-secret' } as never);
    return { db, controller };
  }

  it('reads only the phone of the active account by user ID', async () => {
    const { db, controller } = setup();
    expect((await controller.getContact(userId, 'shared-secret')).data).toEqual({ phone: '+84912345678' });
    expect(db.account.findFirst).toHaveBeenCalledWith({
      where: { userId, status: 'active' }, select: { phone: true },
    });
  });

  it.each([undefined, '', 'wrong-secret', 'wrong-secret!'])('rejects invalid internal secret %s before reading data', async secret => {
    const { db, controller } = setup();
    await expect(controller.getContact(userId, secret)).rejects.toThrow(UnauthorizedException);
    expect(db.account.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the account has no phone or is not active', async () => {
    const { db, controller } = setup(null);
    expect((await controller.getContact(userId, 'shared-secret')).data).toEqual({ phone: null });
    db.account.findFirst.mockResolvedValue(null);
    expect((await controller.getContact(userId, 'shared-secret')).data).toEqual({ phone: null });
  });

  it('serves the User Trust client over HTTP and rejects unauthorized or invalid requests', async () => {
    const { db } = setup();
    const module = await Test.createTestingModule({
      controllers: [UserContactController],
      providers: [
        { provide: AuthPrismaService, useValue: db },
        { provide: ConfigService, useValue: { internalServiceSecret: 'shared-secret' } },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    try {
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      const client = new AuthClient({ get: () => origin, internalServiceSecret: 'shared-secret', upstreamTimeoutMs: 1000 } as never);
      expect(await client.getUserPhone(userId)).toBe('+84912345678');

      db.account.findFirst.mockClear();
      const denied = await fetch(`${origin}/api/v1/internal/users/${userId}/contact`);
      expect(denied.status).toBe(401);
      const invalid = await fetch(`${origin}/api/v1/internal/users/invalid/contact`, {
        headers: { 'x-internal-secret': 'shared-secret' },
      });
      expect(invalid.status).toBe(400);
      expect(db.account.findFirst).not.toHaveBeenCalled();

      db.account.findFirst.mockRejectedValue(new Error('database unavailable'));
      expect(await client.getUserPhone(userId)).toBeNull();
    } finally {
      await app.close();
    }
  });
});
