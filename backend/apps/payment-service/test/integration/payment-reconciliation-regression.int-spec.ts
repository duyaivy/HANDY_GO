import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PaymentPrismaService } from '../../src/common/database/payment-prisma.service.js';
import { PaymentOutboxService } from '../../src/common/outbox/payment-outbox.service.js';
import { CommissionRuleService } from '../../src/commission-rules/commission-rule.service.js';
import { OrderEventsService } from '../../src/order-events/order-events.service.js';
import { PaymentOrdersService } from '../../src/payment-orders/payment-orders.service.js';

const previousUrl = process.env.DATABASE_URL_PAYMENT;
const ruleId = randomUUID(),
  orderId = randomUUID(),
  paymentId = randomUUID();
const customerUserId = randomUUID(),
  workerUserId = randomUUID();
const completedAt = new Date('2026-11-01T00:00:00Z');
let database: PaymentPrismaService;

beforeAll(async () => {
  const raw = process.env.PAYMENT_TEST_DATABASE_URL;
  if (!raw) throw new Error('PAYMENT_TEST_DATABASE_URL is required');
  const url = new URL(raw);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/handygo_hg51_payment_test'
  )
    throw new Error('An isolated local payment test database is required');
  process.env.DATABASE_URL_PAYMENT = raw;
  database = new PaymentPrismaService();
  await database.client.commissionRule.create({
    data: {
      id: ruleId,
      ratePercent: '10',
      effectiveFrom: new Date('2190-01-01Z'),
      effectiveTo: new Date('2190-01-02Z'),
      createdByUserId: customerUserId,
    },
  });
  await database.client.payment.create({
    data: {
      id: paymentId,
      orderId,
      customerUserId,
      workerUserId,
      amount: 100n,
      commissionRuleId: ruleId,
      commissionRatePercent: '10',
      platformFee: 10n,
      workerEarning: 90n,
    },
  });
});

afterAll(async () => {
  if (database) {
    await database.client.outboxEvent.deleteMany({
      where: { aggregateId: paymentId },
    });
    await database.client.paymentAttempt.deleteMany({ where: { paymentId } });
    await database.client.payment.deleteMany({ where: { id: paymentId } });
    await database.client.commissionRule.deleteMany({ where: { id: ruleId } });
    await database.onModuleDestroy();
  }
  if (previousUrl === undefined) delete process.env.DATABASE_URL_PAYMENT;
  else process.env.DATABASE_URL_PAYMENT = previousUrl;
});

it('rolls back completion if the transactional outbox fails', async () => {
  const service = new PaymentOrdersService(
    database,
    {
      getEligibility: async () => ({
        customerUserId,
        workerUserId,
        amount: 100n,
        isEligibleForSettlement: true,
        completedAt,
      }),
    } as never,
    {} as never,
    {
      enqueue: vi.fn().mockRejectedValue(new Error('outbox unavailable')),
    } as never,
    {} as never,
  );
  await expect(
    service.open(customerUserId, { orderId, method: 'point' }),
  ).rejects.toThrow('outbox unavailable');
  expect(
    (
      await database.client.payment.findUniqueOrThrow({
        where: { id: paymentId },
      })
    ).orderCompletedAt,
  ).toBeNull();
  expect(
    await database.client.outboxEvent.count({
      where: { aggregateId: paymentId },
    }),
  ).toBe(0);
});

it('concurrent HTTP open and completed delivery commit exactly one pending event', async () => {
  const outbox = new PaymentOutboxService(database);
  const events = new OrderEventsService(
    {} as never,
    new CommissionRuleService(),
    outbox,
  );
  const service = new PaymentOrdersService(
    database,
    {
      getEligibility: async () => ({
        customerUserId,
        workerUserId,
        amount: 100n,
        isEligibleForSettlement: true,
        completedAt,
      }),
    } as never,
    {} as never,
    outbox,
    { findById: vi.fn() } as never,
  );
  await Promise.all([
    service.open(customerUserId, { orderId, method: 'point' }),
    database.client.$transaction((tx) =>
      events.onCompleted(
        {
          orderId,
          customerUserId,
          workerUserId,
          agreedPrice: '100',
          completedAt: completedAt.toISOString(),
        },
        tx,
      ),
    ),
  ]);
  expect(
    await database.client.outboxEvent.count({
      where: { aggregateId: paymentId, eventType: 'payment.pending' },
    }),
  ).toBe(1);
  expect(
    (
      await database.client.payment.findUniqueOrThrow({
        where: { id: paymentId },
      })
    ).orderCompletedAt,
  ).toEqual(completedAt);
});

it('concurrent database sweeps visit all 21 unresolved attempts without claiming one twice', async () => {
  await database.client.payment.update({
    where: { id: paymentId },
    data: { status: 'processing' },
  });
  await database.client.paymentAttempt.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      paymentId,
      attemptNo: i + 1,
      method: 'point' as const,
      provider: 'wallet_internal',
      status: 'processing' as const,
      attemptedAt: new Date(0),
      nextRetryAt: new Date(0),
    })),
  });
  const wallet = {
    debitPayment: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
    getOperation: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
  };
  const build = () =>
    new PaymentOrdersService(
      database,
      {} as never,
      wallet as never,
      new PaymentOutboxService(database),
      {} as never,
    );
  await Promise.all([
    build().resumeStaleAttempts(1000),
    build().resumeStaleAttempts(1000),
  ]);
  await build().resumeStaleAttempts(1000);
  expect(wallet.debitPayment).toHaveBeenCalledTimes(21);
  expect(
    new Set(wallet.debitPayment.mock.calls.map(([, body]) => body.attemptId))
      .size,
  ).toBe(21);
});
