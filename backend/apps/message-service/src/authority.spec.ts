import { describe, expect, it, vi } from 'vitest';
import { AuthorityClient } from './authority.js';
const c = '11111111-1111-4111-8111-111111111111',
  w = '22222222-2222-4222-8222-222222222222';
describe('authoritative lifecycle admission', () => {
  it('requires bid/order ownership bindings and active committed bid', async () => {
    const client = new AuthorityClient(
      {
        secret: 'secret',
        bidding: 'http://bid',
        order: 'http://order',
        auth: 'http://auth',
        media: 'http://media',
      },
      vi.fn(
        async (url) =>
          new Response(
            JSON.stringify({
              data: String(url).includes('bids')
                ? {
                    bidId: c,
                    requestId: c,
                    workerId: w,
                    status: 'active',
                    eligible: true,
                    validUntil: null,
                    roundStatus: 'open',
                    version: 1,
                    submittedAt: new Date().toISOString(),
                    verifiedAt: new Date().toISOString(),
                  }
                : {
                    requestId: c,
                    customerId: c,
                    status: 'open_for_bidding',
                    order: null,
                    version: 1,
                    verifiedAt: new Date().toISOString(),
                  },
            }),
          ),
      ) as typeof fetch,
    );
    const result = await client.permission(
      c,
      { requestId: c, workerId: w, customerId: c },
      true,
    );
    expect(result.permissions.send).toBe(true);
    await expect(
      client.permission(c, { requestId: c, workerId: w, customerId: w }, true),
    ).rejects.toThrow('ELIGIBILITY_UNAVAILABLE');
  });
  it('fails closed for unknown and unavailable upstreams', async () => {
    const client = new AuthorityClient(
      {
        secret: 'secret',
        bidding: 'http://bid',
        order: 'http://order',
        auth: 'http://auth',
        media: 'http://media',
      },
      vi.fn(async () => {
        throw new Error('credentials must never leak');
      }) as typeof fetch,
    );
    await expect(client.bid(c)).rejects.toThrow('ELIGIBILITY_UNAVAILABLE');
  });
});
