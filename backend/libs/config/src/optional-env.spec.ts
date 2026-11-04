import { ConfigService as NestConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from './config.service.js';
import { ConfigModule, validateEnvironment } from './config.module.js';
import { optionalValue } from './optional-env.js';
import { databasePoolConfig, runtimeDatabaseUrl } from '../../database/src/pool.config.js';
import { migrationUrl } from '../../../scripts/migration-url.js';
import { eventTransportOptions } from '../../../apps/notification-service/src/events/event-topology.js';
import { NotificationPolicy } from '../../../apps/notification-service/src/events/notification-policy.js';

const services = ['auth', 'user-trust', 'catalog', 'order', 'bidding', 'matching', 'tracking', 'notification', 'wallet'];
afterEach(() => vi.unstubAllEnvs());

describe('optional environment configuration', () => {
  it('keeps Nest process ENV lookup while shared getters treat blanks as unset', async () => {
    vi.stubEnv('OPTIONAL_ENV_LOOKUP_FIXTURE', undefined);
    vi.stubEnv('CLOUDINARY_VIDEO_CHUNK_SIZE_MB', ' \t ');
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ serviceName: 'test-service', defaultPort: 3999 })],
    }).compile();
    try {
      vi.stubEnv('OPTIONAL_ENV_LOOKUP_FIXTURE', 'configured-after-startup');
      expect(module.get(NestConfigService).get('OPTIONAL_ENV_LOOKUP_FIXTURE')).toBe('configured-after-startup');
      expect(module.get(ConfigService).cloudinaryVideoChunkSizeMb).toBe(20);
    } finally {
      await module.close();
    }
  });

  it.each([undefined, '', ' \t '])('uses existing defaults for blank optional values: %s', value => {
    expect(optionalValue(value)).toBeUndefined();
    const config = validateEnvironment({ LOG_LEVEL: value, CLOUDINARY_VIDEO_CHUNK_SIZE_MB: value }, { serviceName: 'test', defaultPort: 3999 });
    expect(config.LOG_LEVEL).toBe('debug');
    const service = new ConfigService(new NestConfigService({ SMTP_HOST: value, OTP_MAX_ATTEMPTS: value, CLOUDINARY_VIDEO_CHUNK_SIZE_MB: value }));
    expect(service.smtpHost).toBe('smtp.gmail.com');
    expect(service.otpMaxAttempts).toBe(5);
    expect(service.cloudinaryVideoChunkSizeMb).toBe(20);
    vi.stubEnv('NOTIFICATION_EVENT_QUEUE', value);
    vi.stubEnv('NOTIFICATION_EVENT_PREFETCH', value);
    vi.stubEnv('RABBITMQ_EXCHANGE', value);
    expect(eventTransportOptions()).toMatchObject({ queue: 'notification-service.events.v1', prefetch: 10, exchange: 'handy-go.events' });
    expect(() => new NotificationPolicy(new NestConfigService({ NOTIFICATION_EVENT_POLICIES: value }))).not.toThrow();
  });

  it('preserves nonblank values and rejects invalid configured values', () => {
    expect(optionalValue(' secret with spaces ')).toBe(' secret with spaces ');
    expect(validateEnvironment({ CLOUDINARY_VIDEO_CHUNK_SIZE_MB: '24' }, { serviceName: 'test', defaultPort: 3999 }).CLOUDINARY_VIDEO_CHUNK_SIZE_MB).toBe('24');
    expect(() => validateEnvironment({ CLOUDINARY_VIDEO_CHUNK_SIZE_MB: 'invalid' }, { serviceName: 'test', defaultPort: 3999 })).toThrow('greater than 5');
    vi.stubEnv('NOTIFICATION_EVENT_QUEUE', 'invalid queue');
    expect(() => eventTransportOptions()).toThrow('INVALID_NOTIFICATION_EVENT_QUEUE');
    expect(() => validateEnvironment({ UPSTREAM: 'invalid' }, { serviceName: 'test', defaultPort: 3999, requiredUrls: ['UPSTREAM'] })).toThrow('valid URL');
    expect(() => databasePoolConfig('postgresql://u:p@db:0/db', 'order')).toThrow('Invalid PostgreSQL');
  });

  it.each([undefined, '', ' \t '])('keeps required keys strict: %s', value => {
    expect(() => validateEnvironment({ SECRET: value }, { serviceName: 'test', defaultPort: 3999, requiredKeys: ['SECRET'] })).toThrow('required');
    expect(() => validateEnvironment({ UPSTREAM: value }, { serviceName: 'test', defaultPort: 3999, requiredUrls: ['UPSTREAM'] })).toThrow('required');
  });

  it.each(services)('resolves runtime and migration overrides consistently for %s', service => {
    const suffix = service.toUpperCase().replaceAll('-', '_');
    const schema = service.replaceAll('-', '_') + '_service';
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HANDYGO_MIGRATION', '1');
    // Deployment preflight owns DDL confirmation; standalone CLI adds no new gate.
    vi.stubEnv(`DB_DDL_VERIFIED_${suffix}`, undefined);
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@session/db');
    vi.stubEnv('DB_POOL_MAX', '2');
    for (const blank of [undefined, '', ' \t ']) {
      vi.stubEnv(`DIRECT_URL_${suffix}`, blank);
      vi.stubEnv(`DATABASE_URL_${suffix}`, blank);
      vi.stubEnv(`DB_POOL_MAX_${suffix}`, blank);
      vi.stubEnv('DB_POOL_TIMEOUT_MS', blank);
      expect(runtimeDatabaseUrl(service, 'unused')).toBe('postgresql://u:p@session/db');
      expect(databasePoolConfig(runtimeDatabaseUrl(service, 'unused'), service).max).toBe(2);
      expect(migrationUrl(service, schema)).toContain(`session/db?schema=${schema}`);
    }
    vi.stubEnv(`DATABASE_URL_${suffix}`, 'postgresql://u:p@override/db');
    expect(runtimeDatabaseUrl(service, 'unused')).toContain('@override/');
    expect(migrationUrl(service, schema)).toContain('@override/');
    vi.stubEnv(`DIRECT_URL_${suffix}`, 'postgresql://ddl:p@direct/db');
    expect(migrationUrl(service, schema)).toContain('@direct/');
    vi.stubEnv(`DIRECT_URL_${suffix}`, 'invalid');
    expect(() => migrationUrl(service, schema)).toThrow('Invalid migration URL');
    vi.stubEnv(`DIRECT_URL_${suffix}`, undefined);
    vi.stubEnv(`DATABASE_URL_${suffix}`, 'invalid');
    expect(() => databasePoolConfig(runtimeDatabaseUrl(service, 'unused'), service)).toThrow('Invalid PostgreSQL');
    vi.stubEnv(`DATABASE_URL_${suffix}`, undefined);
    vi.stubEnv('DATABASE_URL', undefined);
    expect(() => runtimeDatabaseUrl(service, 'unused')).toThrow('required');
    expect(() => migrationUrl(service, schema)).toThrow('required');
  });

  it.each([['5432', 'aws-0-region.pooler.supabase.com'], ['6543', 'aws-0-region.pooler.supabase.com'], ['6543', 'AWS-0-REGION.POOLER.SUPABASE.COM']])('accepts Supabase port %s at runtime; migration requires session semantics', (port, hostname) => {
    const url = `postgresql://postgres.tenant:p@${hostname}:${port}/postgres`;
    vi.stubEnv('DB_POOL_MAX', '1');
    expect(databasePoolConfig(url, 'order').connectionString).toBe(url);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HANDYGO_MIGRATION', '1');
    vi.stubEnv('DIRECT_URL_ORDER', undefined);
    vi.stubEnv('DATABASE_URL_ORDER', undefined);
    vi.stubEnv('DATABASE_URL', url);
    if (port === '6543') expect(() => migrationUrl('order', 'order_service')).toThrow('transaction pooler');
    else expect(migrationUrl('order', 'order_service')).toContain(':5432/');
  });
});
