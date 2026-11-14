import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommissionRuleService } from '../../src/commission-rules/commission-rule.service.js';
import { PaymentPrismaService } from '../../src/common/database/payment-prisma.service.js';
import { PaymentInboxService } from '../../src/common/inbound/payment-inbox.service.js';
import { PaymentOutboxService } from '../../src/common/outbox/payment-outbox.service.js';
import { OrderEventsService } from '../../src/order-events/order-events.service.js';
import { PaymentOrdersService } from '../../src/payment-orders/payment-orders.service.js';
import { PaymentQueryService } from '../../src/payment-query/payment-query.service.js';

// Fixtures live in an interval that no other test or real rule uses (rules must not overlap).
const ruleFrom = '2000-01-01T00:00:00Z';
const ruleTo = '2000-01-02T00:00:00Z';
const orderCreatedAt = '2000-01-01T12:00:00.000Z';
const ruleId = randomUUID();
const orderId = randomUUID();
const customerId = randomUUID();
const workerId = randomUUID();
const eventIds = [`it-created-${randomUUID()}`, `it-completed-${randomUUID()}`];
const originalDatabaseUrl = process.env.DATABASE_URL_PAYMENT;

let db: Client;
let database: PaymentPrismaService;
let inbox: PaymentInboxService;
let orders: PaymentOrdersService;
const wallet = {
  debitPayment: vi.fn(),
  getOperation: vi.fn(),
  collectCommission: vi.fn(),
};

beforeAll(async () => {
  const rawUrl = process.env.PAYMENT_TEST_DATABASE_URL;
  if (!rawUrl) throw new Error('PAYMENT_TEST_DATABASE_URL is required');
  const url = new URL(rawUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/handygo_hg51_payment_test') {
    throw new Error('Payment flow tests require the isolated local handygo_hg51_payment_test database');
  }
  process.env.DATABASE_URL_PAYMENT = rawUrl;
  url.searchParams.delete('schema');
  db = new Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(
    `INSERT INTO payment_service.commission_rules (id, rate_percent, effective_from, effective_to, is_active, created_by_user_id)
     VALUES ($1, 10, $2, $3, true, $4)`,
    [ruleId, ruleFrom, ruleTo, randomUUID()],
  );

  database = new PaymentPrismaService();
  const outbox = new PaymentOutboxService(database);
  inbox = new PaymentInboxService(database, { ack: vi.fn(), nack: vi.fn() } as never);
  new OrderEventsService(inbox, new CommissionRuleService(), outbox).onModuleInit();
  const eligibility = {
    getEligibility: async () => ({
      orderId, customerUserId: customerId, workerUserId: workerId, status: 'completed', paymentState: 'unpaid',
      amount: 100000n, currency: 'VND', isEligibleForSettlement: true,
    }),
  };
  orders = new PaymentOrdersService(database, eligibility as never, wallet as never, outbox, new PaymentQueryService(database));
});

afterAll(async () => {
  if (db) {
    await db.query(`DELETE FROM payment_service.outbox_events WHERE aggregate_id IN (SELECT id FROM payment_service.payments WHERE order_id = $1)`, [orderId]);
    await db.query(`DELETE FROM payment_service.payment_settlements WHERE payment_id IN (SELECT id FROM payment_service.payments WHERE order_id = $1)`, [orderId]);
    await db.query(`DELETE FROM payment_service.payment_attempts WHERE payment_id IN (SELECT id FROM payment_service.payments WHERE order_id = $1)`, [orderId]);
    await db.query('DELETE FROM payment_service.payments WHERE order_id = $1', [orderId]);
    await db.query('DELETE FROM payment_service.consumed_events WHERE event_id = ANY($1)', [eventIds]);
    await db.query('DELETE FROM payment_service.failed_inbound_events WHERE event_id = ANY($1)', [eventIds]);
    await db.query('DELETE FROM payment_service.commission_rules WHERE id = $1', [ruleId]);
    await db.end();
  }
  if (database) await database.onModuleDestroy();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL_PAYMENT;
  else process.env.DATABASE_URL_PAYMENT = originalDatabaseUrl;
});

const created = {
  orderId, customerUserId: customerId, workerUserId: workerId, agreedPrice: '100000.00', currency: 'VND', createdAt: orderCreatedAt,
};

describe('Payment migrations', () => {
  it('contains the inbound retry table and payout operation column', async () => {
    const table = await db.query(`SELECT to_regclass('payment_service.failed_inbound_events') AS t`);
    expect(table.rows[0].t).not.toBeNull();
    const column = await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'payment_service' AND table_name = 'payouts' AND column_name = 'payout_operation_id'`,
    );
    expect(column.rowCount).toBe(1);
  });
});

describe('Order events and Point payment against PostgreSQL', () => {
  it('creates one payment with the commission snapshot and ignores a duplicate delivery', async () => {
    await expect(inbox.handle('order.created', { eventId: eventIds[0], data: created })).resolves.toBe('processed');
    await expect(inbox.handle('order.created', { eventId: eventIds[0], data: created })).resolves.toBe('duplicate');
    const rows = await db.query('SELECT amount, platform_fee, worker_earning, status FROM payment_service.payments WHERE order_id = $1', [orderId]);
    expect(rows.rows).toEqual([{ amount: '100000', platform_fee: '10000', worker_earning: '90000', status: 'pending' }]);
  });

  it('opens the payment on order.completed without charging', async () => {
    await expect(inbox.handle('order.completed', {
      eventId: eventIds[1], data: { ...created, completedAt: '2026-11-05T00:00:00.000Z' },
    })).resolves.toBe('processed');
    const rows = await db.query('SELECT order_completed_at, status FROM payment_service.payments WHERE order_id = $1', [orderId]);
    expect(rows.rows[0].order_completed_at).not.toBeNull();
    expect(rows.rows[0].status).toBe('pending');
    expect(wallet.debitPayment).not.toHaveBeenCalled();
  });

  it('serializes a double click: one attempt, one succeeded payment, one outbox event', async () => {
    const { rows } = await db.query('SELECT id FROM payment_service.payments WHERE order_id = $1', [orderId]);
    const paymentId = rows[0].id as string;
    await orders.open(customerId, { orderId, method: 'point' });
    wallet.debitPayment.mockResolvedValue({ outcome: 'ok', status: 200, data: { status: 'completed' } });

    await Promise.all([orders.payWithPoints(customerId, paymentId), orders.payWithPoints(customerId, paymentId)]);

    const attempts = await db.query('SELECT status FROM payment_service.payment_attempts WHERE payment_id = $1', [paymentId]);
    expect(attempts.rows).toEqual([{ status: 'succeeded' }]);
    const payment = await db.query('SELECT status FROM payment_service.payments WHERE id = $1', [paymentId]);
    expect(payment.rows[0].status).toBe('succeeded');
    const events = await db.query(
      `SELECT count(*)::int AS n FROM payment_service.outbox_events WHERE aggregate_id = $1 AND event_type = 'payment.succeeded'`,
      [paymentId],
    );
    expect(events.rows[0].n).toBe(1);
  });
});
