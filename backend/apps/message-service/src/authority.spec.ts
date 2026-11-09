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

describe('best effort conversation labels', () => {
  const options = {
    secret: 'secret',
    bidding: 'http://bid',
    order: 'http://order',
    auth: 'http://auth',
    media: 'http://media',
    userTrust: 'http://users',
    catalog: 'http://catalog',
  };
  it('resolves actual participant names in one batch and the catalog service name', async () => {
    const request = vi.fn(
      async (url) =>
        new Response(
          JSON.stringify({
            data: String(url).includes('/services/')
              ? { id: c, name: 'Vệ sinh máy lạnh' }
              : [
                  { id: c, fullName: 'Khách An' },
                  { id: w, fullName: 'Thợ Bình' },
                ],
          }),
        ),
    ) as typeof fetch;
    const client = new AuthorityClient(options, request);
    expect(await client.displayNames([c, w, c])).toEqual({
      [c]: 'Khách An',
      [w]: 'Thợ Bình',
    });
    expect(await client.serviceName(c)).toBe('Vệ sinh máy lạnh');
  });
  it('omits labels when dependencies fail or return malformed data', async () => {
    const client = new AuthorityClient(
      options,
      vi.fn(async () => {
        throw Error('offline');
      }) as typeof fetch,
    );
    expect(await client.displayNames([c, w])).toEqual({});
    expect(await client.serviceName(c)).toBeUndefined();
    const malformed = new AuthorityClient(
      options,
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: [{ id: c, fullName: { private: true } }] }),
          ),
      ) as typeof fetch,
    );
    expect(await malformed.displayNames([c])).toEqual({});
    expect(await malformed.serviceName(c)).toBeUndefined();
  });
});

describe('session active verification resilience', () => {
  const options = {
    secret: 'secret',
    bidding: 'http://bid',
    order: 'http://order',
    auth: 'http://auth',
    media: 'http://media',
  };
  it('uses fresh session cache but rejects repeated upstream failures after expiration', async () => {
    let callCount = 0;
    const request = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ data: { active: true } }));
      }
      // Simulate timeout on subsequent refresh
      throw new Error('Connection timeout');
    }) as typeof fetch;

    const client = new AuthorityClient(options, request);
    const accountId = '934140dd-27eb-4dfb-832b-6ab064ba6444';
    const userId = '9b364a7f-b818-41a6-b0ef-59ff10af8598';
    const sid = '11582bc1-a554-4642-8443-e51922299cf1';

    // 1. Initial verification succeeds
    const first = await client.active(accountId, userId, sid);
    expect(first).toBe(true);
    expect(callCount).toBe(1);

    // 2. Cache hit within TTL
    const second = await client.active(accountId, userId, sid);
    expect(second).toBe(true);
    expect(callCount).toBe(1); // No new network call

    // 3. Fast-forward cache expiry
    // @ts-expect-error accessing private cache for test
    const entry = client.activeCache.get(`${accountId}:${userId}:${sid}`);
    if (entry) entry.expiresAt = Date.now() - 1;

    // Expired evidence must never be extended by an unavailable upstream.
    await expect(client.active(accountId, userId, sid)).rejects.toThrow(
      'ELIGIBILITY_UNAVAILABLE',
    );
    await expect(client.active(accountId, userId, sid)).rejects.toThrow(
      'ELIGIBILITY_UNAVAILABLE',
    );
    expect(callCount).toBe(3);
  });

  it('immediately returns false when auth service explicitly indicates revoked session', async () => {
    const request = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { active: false } }));
    }) as typeof fetch;

    const client = new AuthorityClient(options, request);
    const accountId = '934140dd-27eb-4dfb-832b-6ab064ba6444';
    const userId = '9b364a7f-b818-41a6-b0ef-59ff10af8598';
    const sid = '11582bc1-a554-4642-8443-e51922299cf1';

    const result = await client.active(accountId, userId, sid);
    expect(result).toBe(false);
  });
});
