import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  backfillPaymentPending,
  type ReviewedPayment,
} from '../../../../scripts/lib/payment-pending-backfill.js';
import { PaymentPrismaService } from '../../src/common/database/payment-prisma.service.js';
import { paymentPendingEvent } from '../../src/common/outbox/payment-events.js';
import { PaymentOutboxService } from '../../src/common/outbox/payment-outbox.service.js';

let pool: Pool, db: PaymentPrismaService;
const ruleId = randomUUID(),
  actorId = randomUUID();
const ids: string[] = [];
const cutoff = new Date('2099-01-01');
const review = (id: string): ReviewedPayment => ({
  paymentId: id,
  downstreamState: 'awaiting_payment',
  evidence: 'isolated downstream reconciliation fixture',
  checkedAt: new Date().toISOString(),
});
const apply = (paymentIds: string[]) => ({
  apply: true,
  actorId,
  reason: 'Recover historical missing event',
  cutoff,
  reviewed: paymentIds.map(review),
});

beforeAll(async () => {
  const raw = process.env.PAYMENT_TEST_DATABASE_URL;
  const url = new URL(raw ?? '');
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/handygo_hg51_payment_test'
  )
    throw new Error('Isolated Payment test DB required');
  pool = new Pool({ connectionString: raw, max: 12 });
  db = new PaymentPrismaService();
  await db.client.commissionRule.create({
    data: {
      id: ruleId,
      ratePercent: '10',
      effectiveFrom: new Date('2001-01-01'),
      effectiveTo: new Date('2001-01-02'),
      isActive: false,
      createdByUserId: actorId,
    },
  });
});

afterAll(async () => {
  if (db) {
    await db.client.outboxEvent.deleteMany({
      where: { aggregateId: { in: ids } },
    });
    await db.client.adminAuditLog.deleteMany({
      where: { actorUserId: actorId },
    });
    await db.client.paymentSettlement.deleteMany({
      where: { paymentId: { in: ids } },
    });
    await db.client.paymentAttempt.deleteMany({
      where: { paymentId: { in: ids } },
    });
    await db.client.payment.deleteMany({ where: { id: { in: ids } } });
    await db.client.commissionRule.deleteMany({ where: { id: ruleId } });
    await db.onModuleDestroy();
  }
  if (pool) await pool.end();
});

async function fixture(
  status:
    | 'pending'
    | 'failed'
    | 'processing'
    | 'succeeded'
    | 'refunded'
    | 'cancelled'
    | 'partially_refunded' = 'pending',
) {
  const row = await db.client.payment.create({
    data: {
      orderId: randomUUID(),
      customerUserId: randomUUID(),
      workerUserId: randomUUID(),
      amount: 100n,
      platformFee: 10n,
      workerEarning: 90n,
      method: 'point',
      status,
      commissionRuleId: ruleId,
      commissionRatePercent: '10',
      orderCompletedAt: new Date('2026-11-01'),
    },
  });
  ids.push(row.id);
  return row;
}

describe('Historical payment.pending recovery against PostgreSQL', () => {
  it('runs the real CLI in dry-run/apply/replay modes and refuses an existing report before mutation', async () => {
    const p = await fixture(),
      other = await fixture();
    const directory = await mkdtemp(path.join(tmpdir(), 'handygo-backfill-'));
    const report = path.join(directory, 'dry.json'),
      applied = path.join(directory, 'apply.json');
    const replay = path.join(directory, 'replay.json'),
      manifest = path.join(directory, 'reviewed.json');
    const cli = path.resolve('scripts/backfill-payment-pending.mjs');
    const run = (args: string[]) =>
      promisify(execFile)(
        process.execPath,
        ['--experimental-strip-types', cli, ...args],
        {
          env: {
            ...process.env,
            DATABASE_URL_PAYMENT: process.env.PAYMENT_TEST_DATABASE_URL,
          },
        },
      );
    try {
      await run(['--report', report, '--cutoff', cutoff.toISOString()]);
      expect(JSON.parse(await readFile(report, 'utf8')).mode).toBe('dry-run');
      expect(
        await db.client.outboxEvent.count({ where: { aggregateId: p.id } }),
      ).toBe(0);
      await writeFile(manifest, JSON.stringify([review(p.id)]));
      const args = [
        '--apply',
        '--reviewed',
        manifest,
        '--actor',
        actorId,
        '--reason',
        'CLI recovery fixture',
        '--cutoff',
        cutoff.toISOString(),
      ];
      await run([...args, '--report', applied]);
      expect(JSON.parse(await readFile(applied, 'utf8')).counts).toEqual({
        backfilled: 1,
      });
      await run([...args, '--report', replay]);
      expect(JSON.parse(await readFile(replay, 'utf8')).counts).toEqual({
        existing_event: 1,
      });
      await writeFile(manifest, JSON.stringify([review(other.id)]));
      await expect(run([...args, '--report', applied])).rejects.toMatchObject({
        code: 1,
      });
      expect(
        await db.client.outboxEvent.count({ where: { aggregateId: other.id } }),
      ).toBe(0);
    } finally {
      for (const file of [report, applied, replay, manifest])
        await unlink(file).catch(() => undefined);
      await rmdir(directory);
    }
  });
  it('dry-run inventories missing events without changing payment, outbox or audit', async () => {
    const p = await fixture();
    const report = await backfillPaymentPending(pool, {
      cutoff,
      paymentIds: [p.id],
    });
    expect(report.counts).toEqual({ candidate: 1 });
    expect(await db.client.payment.findUnique({ where: { id: p.id } })).toEqual(
      p,
    );
    expect(
      await db.client.outboxEvent.count({ where: { aggregateId: p.id } }),
    ).toBe(0);
    expect(
      await db.client.adminAuditLog.count({ where: { entityId: p.id } }),
    ).toBe(0);
  });

  it('requires explicit downstream evidence before apply', async () => {
    await expect(
      backfillPaymentPending(pool, {
        cutoff,
        apply: true,
        actorId,
        reason: 'test',
      }),
    ).rejects.toThrow('reviewed downstream manifest');
    await expect(
      backfillPaymentPending(pool, {
        ...apply([randomUUID()]),
        reviewed: [{ ...review(randomUUID()), evidence: '' }],
      }),
    ).rejects.toThrow('downstream evidence');
  });

  it('concurrent and repeated apply produces one event and one atomic audit, using the v1 event contract', async () => {
    const p = await fixture('failed');
    const reports = await Promise.all(
      Array.from({ length: 6 }, () =>
        backfillPaymentPending(pool, apply([p.id])),
      ),
    );
    expect(
      reports.reduce((sum, r) => sum + (r.counts.backfilled ?? 0), 0),
    ).toBe(1);
    const events = await db.client.outboxEvent.findMany({
      where: { aggregateId: p.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual(paymentPendingEvent(p).payload);
    const audit = await db.client.adminAuditLog.findMany({
      where: { entityId: p.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].afterState).toMatchObject({ eventId: events[0].id });
    expect((await backfillPaymentPending(pool, apply([p.id]))).counts).toEqual({
      existing_event: 1,
    });
    expect(await db.client.payment.findUnique({ where: { id: p.id } })).toEqual(
      p,
    );
  });

  it('does not recreate published, retrying or dead events, and classifies terminal/in-flight payments separately', async () => {
    const selected: string[] = [];
    for (const status of ['published', 'pending', 'dlq_retry', 'failed']) {
      const p = await fixture();
      selected.push(p.id);
      await new PaymentOutboxService(db).enqueue(
        undefined,
        paymentPendingEvent(p),
      );
      await db.client.outboxEvent.updateMany({
        where: { aggregateId: p.id },
        data: { status },
      });
    }
    for (const status of [
      'succeeded',
      'refunded',
      'partially_refunded',
      'cancelled',
    ] as const)
      selected.push((await fixture(status)).id);
    selected.push((await fixture('processing')).id);
    const inflight = await fixture('failed');
    selected.push(inflight.id);
    await db.client.paymentAttempt.create({
      data: {
        paymentId: inflight.id,
        attemptNo: 1,
        method: 'point',
        provider: 'wallet_internal',
        status: 'processing',
      },
    });
    const settled = await fixture();
    selected.push(settled.id);
    await db.client.paymentSettlement.create({
      data: {
        paymentId: settled.id,
        status: 'settled',
        grossAmount: 100n,
        platformFee: 10n,
        workerEarning: 90n,
      },
    });
    const report = await backfillPaymentPending(pool, apply(selected));
    expect(report.counts).toEqual({
      existing_event: 4,
      terminal_requires_review: 5,
      processing_requires_review: 2,
    });
    expect(
      await db.client.outboxEvent.count({
        where: { aggregateId: { in: selected } },
      }),
    ).toBe(4);
  });

  it('rechecks a concurrent settlement after acquiring the Payment row lock', async () => {
    const p = await fixture();
    const locker = await pool.connect();
    try {
      await locker.query('BEGIN');
      await locker.query(
        "UPDATE payment_service.payments SET status = 'succeeded', paid_at = now() WHERE id = $1::uuid",
        [p.id],
      );
      const pending = backfillPaymentPending(pool, apply([p.id]));
      await vi.waitFor(async () => {
        const waiting = await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT * FROM payment_service.payments%'",
        );
        expect(waiting.rowCount).toBeGreaterThan(0);
      });
      await locker.query('COMMIT');
      expect((await pending).counts).toEqual({ terminal_requires_review: 1 });
      expect(
        await db.client.outboxEvent.count({ where: { aggregateId: p.id } }),
      ).toBe(0);
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
    }
  });

  it('rolls back the outbox insert if the recovery audit fails', async () => {
    const p = await fixture();
    const trigger = `backfill_test_${p.id.replaceAll('-', '')}`;
    await pool.query(
      `CREATE FUNCTION payment_service.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id = '${p.id}' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`,
    );
    await pool.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON payment_service.admin_audit_logs FOR EACH ROW EXECUTE FUNCTION payment_service.${trigger}()`,
    );
    try {
      expect(
        (await backfillPaymentPending(pool, apply([p.id]))).counts,
      ).toEqual({ failed: 1 });
      expect(
        await db.client.outboxEvent.count({ where: { aggregateId: p.id } }),
      ).toBe(0);
    } finally {
      await pool.query(
        `DROP TRIGGER ${trigger} ON payment_service.admin_audit_logs`,
      );
      await pool.query(`DROP FUNCTION payment_service.${trigger}()`);
    }
  });

  it('supports bounded batches and a stable UUID cursor', async () => {
    const a = await fixture(),
      b = await fixture(),
      c = await fixture();
    const selected = [a.id, b.id, c.id].sort();
    const first = await backfillPaymentPending(pool, {
      cutoff,
      paymentIds: selected,
      batchSize: 2,
    });
    expect(first.results.map((row) => row.paymentId)).toEqual(
      selected.slice(0, 2),
    );
    expect(first.hasMore).toBe(true);
    const second = await backfillPaymentPending(pool, {
      cutoff,
      paymentIds: selected,
      batchSize: 2,
      after: first.nextCursor!,
    });
    expect(second.results.map((row) => row.paymentId)).toEqual(
      selected.slice(2),
    );
    expect(second.hasMore).toBe(false);
  });
});
