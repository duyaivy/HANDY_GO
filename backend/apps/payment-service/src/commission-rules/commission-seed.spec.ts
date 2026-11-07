import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { seedConfig } from '../../prisma/seed-commission.js';

describe('Controlled commission seed configuration', () => {
  const env = {
    DATABASE_URL_PAYMENT: 'postgresql://localhost/test',
    COMMISSION_SEED_ACTOR_ID: randomUUID(),
    COMMISSION_SEED_EFFECTIVE_FROM: '2026-11-07T12:00:00+07:00',
  };
  it('requires explicit rollout time and actor without defaults', () => {
    for (const key of [
      'COMMISSION_SEED_ACTOR_ID',
      'COMMISSION_SEED_EFFECTIVE_FROM',
      'DATABASE_URL_PAYMENT',
    ]) {
      expect(() => seedConfig({ ...env, [key]: '' })).toThrow();
    }
  });
  it.each([
    '2026-11-07',
    '2026-11-07T00:00:00',
    '2026-02-30T00:00:00Z',
    'now',
    '',
  ])('rejects invalid or ambiguous rollout time %s', (value) => {
    expect(() =>
      seedConfig({ ...env, COMMISSION_SEED_EFFECTIVE_FROM: value }),
    ).toThrow();
  });
  it('preserves the explicitly configured instant', () => {
    expect(seedConfig(env).effectiveFrom.toISOString()).toBe(
      '2026-11-07T05:00:00.000Z',
    );
  });
});
