import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthClient } from './auth.client.js';

describe('AuthClient contact lookup', () => {
  afterEach(() => vi.unstubAllGlobals());

  function client(baseUrl = 'http://auth-service:3001/') {
    return new AuthClient({
      get: () => baseUrl,
      internalServiceSecret: 'shared-secret',
      upstreamTimeoutMs: 100,
    } as never);
  }

  it.each(['http://auth-service:3001/', 'http://auth-service:3001/api/v1'])('reads the contact envelope at %s', async base => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { phone: '+84912345678' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await client(base).getUserPhone('user-id')).toBe('+84912345678');
    expect(fetchMock).toHaveBeenCalledWith('http://auth-service:3001/api/v1/internal/users/user-id/contact', {
      headers: { 'x-internal-secret': 'shared-secret' }, signal: expect.any(AbortSignal),
    });
  });

  it.each([null, undefined, 123])('does not invent a phone when Auth returns %s', async phone => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { phone } })));
    expect(await client().getUserPhone('user-id')).toBeNull();
  });

  it.each([401, 404, 500])('keeps contact unavailable on HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    expect(await client().getUserPhone('user-id')).toBeNull();
  });

  it('keeps contact unavailable on a connection failure or timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection failed')));
    expect(await client().getUserPhone('user-id')).toBeNull();
  });

  it('does not call Auth without a configured origin', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await client('').getUserPhone('user-id')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
