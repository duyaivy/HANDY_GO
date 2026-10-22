import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@app/config';
import { FirebasePushProvider } from './firebase-push.provider.js';

describe('FirebasePushProvider', () => {
  let configService: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips initialization when PUSH_ENABLED is not true', async () => {
    configService = {
      get: vi.fn((key: string) => (key === 'PUSH_ENABLED' ? 'false' : undefined)),
    } as unknown as ConfigService;

    const provider = new FirebasePushProvider(configService);
    await provider.onModuleInit();

    const results = await provider.sendEach([
      {
        jobId: 'job-1',
        token: 'token-abc',
        title: 'Title',
        body: 'Body',
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errorCode).toBe('PUSH_DISABLED');
  });

  it('returns empty array when sendEach receives empty list', async () => {
    configService = {
      get: vi.fn(() => 'false'),
    } as unknown as ConfigService;

    const provider = new FirebasePushProvider(configService);
    const results = await provider.sendEach([]);
    expect(results).toEqual([]);
  });
});
