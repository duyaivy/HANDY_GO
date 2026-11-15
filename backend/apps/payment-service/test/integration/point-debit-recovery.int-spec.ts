import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@app/config';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PaymentPrismaService } from '../../src/common/database/payment-prisma.service.js';
import { PaymentOutboxService } from '../../src/common/outbox/payment-outbox.service.js';
import { WalletClient } from '../../src/common/clients/wallet.client.js';
import { PaymentOrdersService } from '../../src/payment-orders/payment-orders.service.js';
import { PaymentQueryService } from '../../src/payment-query/payment-query.service.js';
import { WalletPrismaService } from '../../../wallet-service/src/wallet-ledger/wallet-prisma.service.js';
import { WalletLedgerService } from '../../../wallet-service/src/wallet-ledger/wallet-ledger.service.js';
import { PaymentDebitService } from '../../../wallet-service/src/payment-debit/payment-debit.service.js';
import { PaymentDebitController } from '../../../wallet-service/src/payment-debit/payment-debit.controller.js';
import { BigIntSerializerInterceptor } from '../../../wallet-service/src/common/interceptors/bigint-serializer.interceptor.js';
import { RefundAdjustmentService } from '../../../wallet-service/src/refund-adjustment/refund-adjustment.service.js';

let app: INestApplication,
  db: PaymentPrismaService,
  walletDb: WalletPrismaService;
let ledger: WalletLedgerService,
  debit: PaymentDebitService,
  client: WalletClient,
  orders: PaymentOrdersService;
const ruleId = randomUUID(),
  actor = randomUUID();
const paymentIds: string[] = [];
const originalWalletUrl = process.env.DATABASE_URL_WALLET;
const config = {
  internalServiceSecret: 'point-recovery-isolated-secret',
  apiPrefix: 'api/v1',
  upstreamTimeoutMs: 3000,
  getUrl: () => '',
};
const delayed: Promise<unknown>[] = [];

beforeAll(async () => {
  const raw = process.env.PAYMENT_TEST_DATABASE_URL;
  const url = new URL(raw ?? '');
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/handygo_hg51_payment_test'
  )
    throw new Error('Isolated Payment test DB required');
  process.env.DATABASE_URL_WALLET = raw;
  db = new PaymentPrismaService();
  walletDb = new WalletPrismaService();
  ledger = new WalletLedgerService(walletDb);
  debit = new PaymentDebitService(ledger);
  const module = await Test.createTestingModule({
    controllers: [PaymentDebitController],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: PaymentDebitService, useValue: debit },
    ],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  config.getUrl = () => origin;
  client = new WalletClient(config as never);
  orders = new PaymentOrdersService(
    db,
    {} as never,
    client,
    new PaymentOutboxService(db),
    new PaymentQueryService(db),
  );
  await walletDb.wallet.upsert({
    where: { systemKey: 'PLATFORM_FEES' },
    create: { systemKey: 'PLATFORM_FEES' },
    update: {},
  });
  await db.client.commissionRule.create({
    data: {
      id: ruleId,
      ratePercent: '10',
      effectiveFrom: new Date('2002-01-01'),
      effectiveTo: new Date('2002-01-02'),
      isActive: false,
      createdByUserId: actor,
    },
  });
});

afterEach(async () => {
  await Promise.all(delayed.splice(0));
  vi.restoreAllMocks();
  config.upstreamTimeoutMs = 3000;
});

afterAll(async () => {
  if (app) await app.close();
  if (db) {
    await db.client.outboxEvent.deleteMany({
      where: { aggregateId: { in: paymentIds } },
    });
    await db.client.paymentSettlement.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await db.client.paymentAttempt.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await db.client.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await db.client.commissionRule.deleteMany({ where: { id: ruleId } });
    await db.onModuleDestroy();
  }
  if (walletDb) {
    // Wallet ledger is append-only. Keep its uniquely identified fixtures in the
    // isolated throwaway database, like the existing funded refund suite.
    await walletDb.$disconnect();
  }
  if (originalWalletUrl === undefined) delete process.env.DATABASE_URL_WALLET;
  else process.env.DATABASE_URL_WALLET = originalWalletUrl;
});

async function fixture(balance: bigint, reservedBalance = 0n) {
  const customer = randomUUID(),
    worker = randomUUID();
  const source = await walletDb.wallet.create({
    data: { userId: customer, balance, reservedBalance },
  });
  const target = await walletDb.wallet.create({ data: { userId: worker } });
  const payment = await db.client.payment.create({
    data: {
      orderId: randomUUID(),
      customerUserId: customer,
      workerUserId: worker,
      amount: 100n,
      platformFee: 10n,
      workerEarning: 90n,
      method: 'point',
      commissionRuleId: ruleId,
      commissionRatePercent: '10',
      orderCompletedAt: new Date(),
    },
  });
  paymentIds.push(payment.id);
  const body = (attemptId: string) => ({
    paymentId: payment.id,
    attemptId,
    workerUserId: worker,
    grossAmount: '100',
    workerEarning: '90',
    platformFee: '10',
  });
  return { payment, customer, worker, source, target, body };
}

async function paymentState(id: string) {
  return db.client.payment.findUniqueOrThrow({
    where: { id },
    include: { attempts: { orderBy: { attemptNo: 'asc' } } },
  });
}

function delayReplyAfterCommit() {
  const real = debit.debit.bind(debit);
  vi.spyOn(debit, 'debit').mockImplementationOnce(async (...args) => {
    const result = await real(...args);
    const wait = new Promise((resolve) => setTimeout(resolve, 600));
    delayed.push(wait);
    await wait;
    return result;
  });
  config.upstreamTimeoutMs = 150;
}

describe('Point recovery with real Wallet HTTP and PostgreSQL', () => {
  it('database posting failure remains unknown, rolls back all money and retries the same attempt', async () => {
    const f = await fixture(100n);
    const trigger = `posting_test_${f.payment.id.replaceAll('-', '')}`;
    await walletDb.$executeRawUnsafe(
      `CREATE FUNCTION wallet_service.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reference_id = '${f.payment.id}' THEN RAISE EXCEPTION 'test posting failure'; END IF; RETURN NEW; END $$`,
    );
    await walletDb.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON wallet_service.wallet_transactions FOR EACH ROW EXECUTE FUNCTION wallet_service.${trigger}()`,
    );
    try {
      await orders.payWithPoints(f.customer, f.payment.id);
      const state = await paymentState(f.payment.id);
      expect(state.status).toBe('processing');
      expect(
        await ledger.getOperation(`${state.id}:${state.attempts[0].id}`),
      ).toBeNull();
      expect(
        (
          await walletDb.wallet.findUniqueOrThrow({
            where: { id: f.source.id },
          })
        ).balance,
      ).toBe(100n);
      expect(
        (
          await walletDb.wallet.findUniqueOrThrow({
            where: { id: f.target.id },
          })
        ).balance,
      ).toBe(0n);
      expect(
        await walletDb.walletTransaction.count({
          where: { referenceId: f.payment.id },
        }),
      ).toBe(0);
    } finally {
      await walletDb.$executeRawUnsafe(
        `DROP TRIGGER ${trigger} ON wallet_service.wallet_transactions`,
      );
      await walletDb.$executeRawUnsafe(
        `DROP FUNCTION wallet_service.${trigger}()`,
      );
    }
    const pending = await paymentState(f.payment.id);
    await orders.payWithPoints(f.customer, f.payment.id);
    const paid = await paymentState(f.payment.id);
    expect(paid.status).toBe('succeeded');
    expect(paid.attempts.map((a) => a.id)).toEqual(
      pending.attempts.map((a) => a.id),
    );
  });
  it('refund selects the completed debit after a failed attempt; a failed debit alone does not block a cash refund', async () => {
    const f = await fixture(0n);
    expect((await debit.debit(f.customer, f.body(randomUUID()))).status).toBe(
      'failed',
    );
    await walletDb.wallet.update({
      where: { id: f.source.id },
      data: { balance: 100n },
    });
    expect((await debit.debit(f.customer, f.body(randomUUID()))).status).toBe(
      'completed',
    );
    const refunds = new RefundAdjustmentService(ledger);
    expect(
      (
        await refunds.refund(f.customer, {
          paymentId: f.payment.id,
          refundId: randomUUID(),
          amount: '100',
          method: 'point',
          grossAmount: '100',
        })
      ).status,
    ).toBe('completed');
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { id: f.source.id } }))
        .balance,
    ).toBe(100n);
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { id: f.target.id } }))
        .balance,
    ).toBe(0n);
    const cash = await fixture(0n);
    expect(
      (await debit.debit(cash.customer, cash.body(randomUUID()))).status,
    ).toBe('failed');
    await walletDb.wallet.update({
      where: { systemKey: 'PLATFORM_FEES' },
      data: { balance: { increment: 100n } },
    });
    expect(
      (
        await refunds.refund(cash.customer, {
          paymentId: cash.payment.id,
          refundId: randomUUID(),
          amount: '100',
          method: 'cash',
          grossAmount: '100',
        })
      ).status,
    ).toBe('completed');
  });
  it('persists insufficient funds without any posting/event, even when reserved balance causes the shortfall', async () => {
    const f = await fixture(100n, 1n),
      attemptId = randomUUID();
    const operationId = `${f.payment.id}:${attemptId}`;
    const result = await client.debitPayment(f.customer, f.body(attemptId));
    expect(result).toMatchObject({
      outcome: 'ok',
      data: {
        operationId,
        status: 'failed',
        failureCode: 'INSUFFICIENT_FUNDS',
      },
    });
    expect(await client.getOperation(operationId)).toMatchObject({
      outcome: 'ok',
      data: { status: 'failed', failureCode: 'INSUFFICIENT_FUNDS' },
    });
    expect(
      await walletDb.walletTransaction.count({ where: { operationId } }),
    ).toBe(0);
    expect(
      await walletDb.outboxEvent.count({
        where: { payload: { path: ['operationId'], equals: operationId } },
      }),
    ).toBe(0);
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { id: f.source.id } }))
        .balance,
    ).toBe(100n);
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { id: f.target.id } }))
        .balance,
    ).toBe(0n);
  });

  it('insufficient funds → top up → concurrent confirmation creates one new attempt and debits once', async () => {
    const f = await fixture(0n);
    await orders.payWithPoints(f.customer, f.payment.id);
    const failed = await paymentState(f.payment.id);
    expect(failed).toMatchObject({
      status: 'failed',
      failureReason: 'INSUFFICIENT_FUNDS',
    });
    expect(failed.attempts).toHaveLength(1);
    expect(failed.attempts[0].status).toBe('failed');
    await walletDb.wallet.update({
      where: { id: f.source.id },
      data: { balance: 100n },
    });
    const replay = await client.debitPayment(
      f.customer,
      f.body(failed.attempts[0].id),
    );
    expect(replay).toMatchObject({
      outcome: 'ok',
      data: { status: 'failed', idempotentReplay: true },
    });
    await Promise.all(
      Array.from({ length: 6 }, () =>
        orders.payWithPoints(f.customer, f.payment.id),
      ),
    );
    const paid = await paymentState(f.payment.id);
    expect(paid.status).toBe('succeeded');
    expect(paid.attempts.map((a) => a.status)).toEqual(['failed', 'succeeded']);
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { id: f.source.id } }))
        .balance,
    ).toBe(0n);
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { id: f.target.id } }))
        .balance,
    ).toBe(90n);
    expect(
      await walletDb.walletTransaction.count({
        where: {
          operationId: `${paid.id}:${paid.attempts[1].id}`,
          direction: 'debit',
        },
      }),
    ).toBe(1);
    expect(
      await db.client.outboxEvent.count({
        where: { aggregateId: paid.id, eventType: 'payment.succeeded' },
      }),
    ).toBe(1);
  });

  it.each([0n, 100n])(
    'resolves a real HTTP timeout after Wallet commits with balance %s',
    async (balance) => {
      const f = await fixture(balance);
      delayReplyAfterCommit();
      await orders.payWithPoints(f.customer, f.payment.id);
      const state = await paymentState(f.payment.id);
      expect(state.status).toBe(balance ? 'succeeded' : 'failed');
      expect(state.attempts).toHaveLength(1);
      config.upstreamTimeoutMs = 3000;
      const replay = await client.debitPayment(
        f.customer,
        f.body(state.attempts[0].id),
      );
      expect(replay).toMatchObject({
        outcome: 'ok',
        data: {
          idempotentReplay: true,
          status: balance ? 'completed' : 'failed',
        },
      });
      expect(
        (
          await walletDb.wallet.findUniqueOrThrow({
            where: { id: f.source.id },
          })
        ).balance,
      ).toBe(0n);
      expect(
        (
          await walletDb.wallet.findUniqueOrThrow({
            where: { id: f.target.id },
          })
        ).balance,
      ).toBe(balance ? 90n : 0n);
    },
  );

  it('keeps an unknown operation on the same attempt until reconciliation resolves it', async () => {
    const f = await fixture(100n);
    vi.spyOn(client, 'debitPayment').mockResolvedValueOnce({
      outcome: 'unknown',
      message: 'simulated upstream outage',
    });
    vi.spyOn(client, 'getOperation').mockResolvedValueOnce({
      outcome: 'missing',
    });
    await orders.payWithPoints(f.customer, f.payment.id);
    const pending = await paymentState(f.payment.id);
    expect(pending.status).toBe('processing');
    await db.client.paymentAttempt.update({
      where: { id: pending.attempts[0].id },
      data: { attemptedAt: new Date(0) },
    });
    await Promise.all([
      orders.resumeStaleAttempts(0),
      orders.payWithPoints(f.customer, f.payment.id),
    ]);
    const paid = await paymentState(f.payment.id);
    expect(paid.status).toBe('succeeded');
    expect(paid.attempts.map((a) => a.id)).toEqual([pending.attempts[0].id]);
    expect(
      await walletDb.walletTransaction.count({
        where: {
          operationId: `${paid.id}:${paid.attempts[0].id}`,
          direction: 'debit',
        },
      }),
    ).toBe(1);
  });

  it('concurrent insufficient replays return one persisted failure; changed payload cannot reuse its ID', async () => {
    const f = await fixture(0n),
      attempt = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        client.debitPayment(f.customer, f.body(attempt)),
      ),
    );
    expect(
      results.every((r) => r.outcome === 'ok' && r.data.status === 'failed'),
    ).toBe(true);
    expect(
      await walletDb.walletTransfer.count({
        where: { operationId: `${f.payment.id}:${attempt}` },
      }),
    ).toBe(1);
    await expect(
      debit.debit(f.customer, {
        ...f.body(attempt),
        grossAmount: '200',
        workerEarning: '180',
        platformFee: '20',
      }),
    ).rejects.toThrow('already used');
    expect(
      await walletDb.walletTransaction.count({
        where: { operationId: `${f.payment.id}:${attempt}` },
      }),
    ).toBe(0);
  });

  it('leaves commission shortfalls retryable on their original operation ID', async () => {
    const f = await fixture(0n),
      operationId = `${f.payment.id}:commission`;
    const input = {
      operationId,
      idempotencyKey: operationId,
      kind: 'commission',
      postings: [
        {
          walletId: f.source.id,
          direction: 'debit' as const,
          amount: 10n,
          type: 'commission_debit',
        },
        {
          walletId: f.target.id,
          direction: 'credit' as const,
          amount: 10n,
          type: 'commission_credit',
        },
      ],
    };
    await expect(ledger.createBalancedTransfer(input)).rejects.toThrow(
      'Insufficient',
    );
    expect(await ledger.getOperation(operationId)).toBeNull();
    await walletDb.wallet.update({
      where: { id: f.source.id },
      data: { balance: 10n },
    });
    expect((await ledger.createBalancedTransfer(input)).status).toBe(
      'completed',
    );
  });
});
