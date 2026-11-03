import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@app/config';
import { WorkerProfilesClient } from './worker-profiles.client.js';

describe('WorkerProfilesClient', () => {
  const client = new WorkerProfilesClient({
    getUrl: () => 'http://user-trust-service:3002',
    internalServiceSecret: 'test-secret',
  } as unknown as ConfigService);
  afterEach(() => vi.unstubAllGlobals());
  it('retrieves real names with a server side secret and filters unrequested users', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { workerId: 'w1', fullName: 'Nguyễn Văn An', averageRating: 4.5 },
          { workerId: 'other', fullName: 'Other user' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const profiles = await client.getSummaries(['w1']);
    expect(profiles.get('w1')?.fullName).toBe('Nguyễn Văn An');
    expect(profiles.has('other')).toBe(false);
    expect(fetchMock.mock.calls[0][0].pathname).toBe(
      '/api/v1/internal/workers/batch-summary',
    );
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'x-internal-secret': 'test-secret',
    });
  });
  it('keeps recommendations usable when profile lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unavailable')));
    expect((await client.getSummaries(['w1'])).size).toBe(0);
  });
});
