import { describe, expect, it, vi } from 'vitest';
import { SessionService } from '../common/session/session.service.js';
const ids = {
  accountId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  sid: '33333333-3333-4333-8333-333333333333',
};
describe('chat session introspection', () => {
  it('rejects revoked session without consulting trust', async () => {
    const trust = { confirmUserStatus: vi.fn() };
    const service = new SessionService(
      { refreshSession: { findFirst: vi.fn().mockResolvedValue(null) } } as any,
      {} as any,
      trust as any,
    );
    expect(await service.inspectChatSession(ids)).toEqual({ active: false });
    expect(trust.confirmUserStatus).not.toHaveBeenCalled();
  });
  it('checks live marketplace status before granting access', async () => {
    const trust = {
      confirmUserStatus: vi.fn().mockRejectedValue(new Error('suspended')),
    };
    const service = new SessionService(
      {
        refreshSession: {
          findFirst: vi
            .fn()
            .mockResolvedValue({
              account: { userId: ids.userId, status: 'active', roles: [] },
            }),
        },
      } as any,
      {} as any,
      trust as any,
    );
    await expect(service.inspectChatSession(ids)).rejects.toThrow();
  });
});
