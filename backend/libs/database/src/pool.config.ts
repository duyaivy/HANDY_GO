import { Logger } from '@nestjs/common';
import type { PoolConfig } from 'pg';

/** Prisma v7 delegates pooling to pg, not Prisma URL connection_limit. */
export function databasePoolConfig(connectionString: string, service: string): PoolConfig {
  const key = `DB_POOL_MAX_${service.toUpperCase().replaceAll('-', '_')}`;
  const raw = process.env[key]?.trim() || process.env.DB_POOL_MAX?.trim() || undefined;
  if (process.env.NODE_ENV === 'production' && raw === undefined) {
    throw new Error(`${key} or DB_POOL_MAX is required in production`);
  }
  const integer = (value: string, name: string, max: number): number => {
    if (!/^[1-9][0-9]*$/.test(value) || Number(value) > max) {
      throw new Error(`${name} must be an integer between 1 and ${max}`);
    }
    return Number(value);
  };
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.replaceAll('/', '') || url.port === '0') throw new Error();
    // These parameters do not configure pg's pool; reject misleading budgets.
    if (url.searchParams.has('connection_limit') || url.searchParams.has('pool_timeout')) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid PostgreSQL URL for ${service}; use DB_POOL_* for adapter limits`);
  }
  return {
    connectionString,
    max: integer(raw ?? '1', key, 100),
    connectionTimeoutMillis: integer(process.env.DB_POOL_TIMEOUT_MS?.trim() || '5000', 'DB_POOL_TIMEOUT_MS', 60000),
    idleTimeoutMillis: integer(process.env.DB_POOL_IDLE_MS?.trim() || '10000', 'DB_POOL_IDLE_MS', 300000),
    application_name: `handygo-${service}`,
  };
}

/** Do not log driver messages: they can contain URLs, SQL and credentials. */
export function databasePoolError(service: string): () => void {
  const logger = new Logger('DatabasePool');
  return () => logger.error(`PostgreSQL idle connection failed for ${service}; check endpoint availability and connection budget`);
}

/** Keep service overrides optional without hiding a missing production connection. */
export function runtimeDatabaseUrl(service: string, developmentFallback: string): string {
  const suffix = service.toUpperCase().replaceAll('-', '_');
  const raw = process.env[`DATABASE_URL_${suffix}`]?.trim() || process.env.DATABASE_URL?.trim();
  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error(`DATABASE_URL_${suffix} or DATABASE_URL is required`);
  }
  return raw || developmentFallback;
}
