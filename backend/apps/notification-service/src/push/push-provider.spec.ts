import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@app/config';
import { deleteApp, getApps } from 'firebase-admin/app';
import { FirebasePushProvider } from './firebase-push.provider.js';

describe('FirebasePushProvider', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const app of getApps()) {
      await deleteApp(app);
    }
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

  it('throws descriptive error when PUSH_ENABLED is true but all credentials are missing', async () => {
    configService = {
      get: vi.fn((key: string) => (key === 'PUSH_ENABLED' ? 'true' : undefined)),
    } as unknown as ConfigService;

    const provider = new FirebasePushProvider(configService);
    await expect(provider.onModuleInit()).rejects.toThrow(
      'Firebase credentials missing. Provide FIREBASE_SA_BASE64, GOOGLE_APPLICATION_CREDENTIALS file path, or FIREBASE_PROJECT_ID when PUSH_ENABLED=true',
    );
  });

  it('throws error when FIREBASE_SA_BASE64 contains invalid JSON', async () => {
    const invalidBase64 = Buffer.from('not-valid-json').toString('base64');
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'PUSH_ENABLED') return 'true';
        if (key === 'FIREBASE_SA_BASE64') return invalidBase64;
        return undefined;
      }),
    } as unknown as ConfigService;

    const provider = new FirebasePushProvider(configService);
    await expect(provider.onModuleInit()).rejects.toThrow(
      'Failed to parse FIREBASE_SA_BASE64',
    );
  });
});
