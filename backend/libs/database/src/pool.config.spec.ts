import { afterEach, describe, expect, it, vi } from 'vitest';
import { databasePoolConfig } from './pool.config.js';
import { migrationUrl } from '../../../scripts/migration-url.js';

afterEach(() => vi.unstubAllEnvs());
describe('Prisma pg budget', () => {
  it('uses a small explicit driver cap and finite acquisition timeout', () => {
    vi.stubEnv('DB_POOL_MAX', '2');
    vi.stubEnv('DB_POOL_MAX_ORDER', '1');
    expect(databasePoolConfig('postgresql://u:p@localhost/db', 'order')).toMatchObject({ max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  });
  it.each(['0', '-1', '1.5', '2junk', '101'])('rejects invalid maximum %s', (value) => {
    vi.stubEnv('DB_POOL_MAX_ORDER', value);
    expect(() => databasePoolConfig('postgresql://u:p@localhost/db', 'order')).toThrow('integer');
  });
  it('requires an explicit production budget and does not expose the URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DB_POOL_MAX', undefined);
    vi.stubEnv('DB_POOL_MAX_ORDER', undefined);
    expect(() => databasePoolConfig('postgresql://u:secret@host/db', 'order')).toThrow('required');
  });
  it('rejects obsolete Prisma URL pooling options', () => {
    expect(() => databasePoolConfig('postgresql://u:p@host/db?connection_limit=10', 'order')).toThrow('DB_POOL');
  });
  it('uses the effective connection and requires the correct override schema in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HANDYGO_MIGRATION', '1');
    vi.stubEnv('DIRECT_URL_ORDER', undefined);
    vi.stubEnv('DATABASE_URL_ORDER', undefined);
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@session/db');
    expect(migrationUrl('order', 'order_service')).toContain('session/db?schema=order_service');
    vi.stubEnv('DIRECT_URL_ORDER', 'postgresql://u:p@direct/db?schema=wallet_service');
    expect(() => migrationUrl('order', 'order_service')).toThrow('schema');
    vi.stubEnv('DIRECT_URL_ORDER', 'postgresql://u:p@direct/db');
    expect(migrationUrl('order', 'order_service')).toContain('schema=order_service');
  });
});
