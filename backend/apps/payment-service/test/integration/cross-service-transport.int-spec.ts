import { generateKeyPairSync, randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  INestApplication,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ClientProxyFactory } from '@nestjs/microservices';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  JwtAuthGuard,
  TokenVerifierService,
} from '@app/auth';
import { ConfigService } from '@app/config';
import { OutboxPublisherService } from '@app/common';
import {
  RabbitMQContextService,
  RabbitMQService,
  createRabbitMQOptions,
} from '@app/rabbitmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentPrismaService } from '../../src/common/database/payment-prisma.service.js';
import { PaymentOutboxService } from '../../src/common/outbox/payment-outbox.service.js';
import { AdminAuditService } from '../../src/common/audit/admin-audit.service.js';
import { RefundsService } from '../../src/refunds/refunds.service.js';
import { RefundsController } from '../../src/refunds/refunds.controller.js';
import { PaymentOutboxRepository } from '../../src/common/outbox/payment-outbox.repository.js';
import { PaymentInboxService } from '../../src/common/inbound/payment-inbox.service.js';
import { WalletClient } from '../../src/common/clients/wallet.client.js';
import { OrderEligibilityClient } from '../../src/common/clients/order-eligibility.client.js';
import { PaymentOrdersService } from '../../src/payment-orders/payment-orders.service.js';
import { PaymentOrdersController } from '../../src/payment-orders/payment-orders.controller.js';
import { PaymentQueryService } from '../../src/payment-query/payment-query.service.js';
import { TopupsService } from '../../src/topups/topups.service.js';
import {
  TopupIpnController,
  TopupsController,
  WalletTopupEventsConsumer,
} from '../../src/topups/topups.controller.js';
import { MockTopupProvider } from '../../src/topups/providers/mock-topup.provider.js';
import { PayoutsService } from '../../src/payouts/payouts.service.js';
import { PayoutEventsConsumer } from '../../src/payouts/payout-events.consumer.js';
import { PayoutAdminController } from '../../src/payouts/payout-admin.controller.js';
import { MockPayoutProvider } from '../../src/payouts/mock-payout.provider.js';
import { SandboxBankSnapshotProvider } from '../../src/payouts/sandbox-bank-snapshot.provider.js';
import { WalletPrismaService } from '../../../wallet-service/src/wallet-ledger/wallet-prisma.service.js';
import { WalletLedgerService } from '../../../wallet-service/src/wallet-ledger/wallet-ledger.service.js';
import { RefundAdjustmentService } from '../../../wallet-service/src/refund-adjustment/refund-adjustment.service.js';
import { RefundAdjustmentController } from '../../../wallet-service/src/refund-adjustment/refund-adjustment.controller.js';
import { PaymentDebitService } from '../../../wallet-service/src/payment-debit/payment-debit.service.js';
import { PaymentDebitController } from '../../../wallet-service/src/payment-debit/payment-debit.controller.js';
import { TopupSettlementService } from '../../../wallet-service/src/topup-settlement/topup-settlement.service.js';
import { TopupSettlementConsumer } from '../../../wallet-service/src/topup-settlement/topup-settlement.consumer.js';
import { ConsumerRetryService } from '../../../wallet-service/src/common/messaging/consumer-retry.service.js';
import { WalletOutboxRepository } from '../../../wallet-service/src/wallet-events/wallet-outbox.repository.js';
import { WithdrawalService } from '../../../wallet-service/src/withdrawal/withdrawal.service.js';
import { WithdrawalController } from '../../../wallet-service/src/withdrawal/withdrawal.controller.js';
import { HttpBankAccountVerifier } from '../../../wallet-service/src/withdrawal/bank-account-verifier/http-bank-account-verifier.js';
import { BigIntSerializerInterceptor } from '../../../wallet-service/src/common/interceptors/bigint-serializer.interceptor.js';
import { WorkerCommissionService } from '../../../wallet-service/src/worker-commission/worker-commission.service.js';
import { WorkerCommissionController } from '../../../wallet-service/src/worker-commission/worker-commission.controller.js';
import { PrismaService as OrderDb } from '../../../order-service/src/prisma/prisma.service.js';
import { InternalOrderService } from '../../../order-service/src/internal/internal-order.service.js';
import { InternalOrderController } from '../../../order-service/src/internal/internal-order.controller.js';
import { InternalSecretGuard } from '../../../order-service/src/internal/guards/internal-secret.guard.js';
import { PaymentEventsConsumer } from '../../../order-service/src/consumers/payment-events.consumer.js';
import { ConsumedEventRepository } from '../../../order-service/src/common/inbox/consumed-event.repository.js';
import { ProxyMiddleware } from '../../../api-gateway/src/proxy/proxy.middleware.js';
import { GatewayAuthMiddleware } from '../../../api-gateway/src/auth/gateway-auth.middleware.js';

const customer = randomUUID(),
  worker = randomUUID(),
  bank = randomUUID();
const secret = 'cross-service-isolated-test-secret';
// Managed sandbox bank fixture only. All financial services and transports below are real.
@Controller('internal/users')
class SandboxBankFixture {
  @Post('verify-bank-account')
  verify(
    @Headers('x-internal-secret') supplied: string,
    @Body() body: { userId: string; bankAccountId: string },
  ) {
    return {
      owned:
        supplied === secret &&
        body.userId === customer &&
        body.bankAccountId === bank,
      active: true,
    };
  }
}

const apps: INestApplication[] = [];
const saved = new Map<string, string | undefined>();
const setEnv = (key: string, value: string) => {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  process.env[key] = value;
};
let paymentDb: PaymentPrismaService,
  walletDb: WalletPrismaService,
  orderDb: OrderDb;
let paymentPublisher: OutboxPublisherService,
  walletPublisher: OutboxPublisherService;
let rabbit: RabbitMQService, payouts: PayoutsService;
let gateway: string;
let ruleId: string;
const walletQueue = `wallet-cross-${randomUUID()}`;
let walletConsumer: ReturnType<INestApplication['getMicroservices']>[number];
const urls: Record<string, string> = {};
const config = {
  internalServiceSecret: secret,
  apiPrefix: 'api/v1',
  upstreamTimeoutMs: 3000,
  getUrl: (key: string) => urls[key] ?? urls.PAYMENT_SERVICE_URL,
  get: (key: string) =>
    key === 'WALLET_WITHDRAWALS_ENABLED' ? 'true' : undefined,
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const admin = randomUUID();
function token(id = customer) {
  return new JwtService().sign(
    {
      sub: randomUUID(),
      userId: id,
      sid: randomUUID(),
      roles: [id === admin ? 'Admin' : id === worker ? 'Worker' : 'Customer'],
      permissions: id === admin ? ['payment:reconcile', 'refund:approve'] : [],
      tokenType: 'access',
    },
    {
      privateKey,
      algorithm: 'RS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
}
async function appFor(controllers: any[], providers: any[], queue?: string) {
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    controllers,
    providers: [
      { provide: ConfigService, useValue: config },
      JwtAuthGuard,
      TokenVerifierService,
      ...providers,
    ],
  }).compile();
  const app = module.createNestApplication();
  apps.push(app);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  if (queue) {
    app.connectMicroservice(createRabbitMQOptions(queue));
    await app.startAllMicroservices();
  }
  await app.listen(0, '127.0.0.1');
  return app;
}
async function eventually(check: () => Promise<boolean>) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('Cross-service state did not converge within 8s');
}
async function call(path: string, body?: unknown, id = customer) {
  const response = await fetch(`${gateway}/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${token(id)}`,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  expect(response.status, JSON.stringify(json)).toBeLessThan(300);
  return json.data;
}

beforeAll(async () => {
  const raw = process.env.PAYMENT_TEST_DATABASE_URL;
  if (!raw) throw new Error('PAYMENT_TEST_DATABASE_URL required');
  const db = new URL(raw);
  if (
    !['localhost', '127.0.0.1'].includes(db.hostname) ||
    db.pathname !== '/handygo_hg51_payment_test'
  )
    throw new Error('Isolated test DB required');
  for (const name of ['PAYMENT', 'WALLET', 'ORDER'])
    setEnv(`DATABASE_URL_${name}`, raw);
  setEnv('RABBITMQ_URL', 'amqp://handygo_test:handygo_test_pw@localhost:56674');
  setEnv('RABBITMQ_EXCHANGE', `payment-cross-${randomUUID()}`);
  setEnv(
    'JWT_PUBLIC_KEY',
    publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  setEnv('TOPUP_MOCK_ENABLED', 'true');
  setEnv('PAYOUT_MOCK_ENABLED', 'true');
  paymentDb = new PaymentPrismaService();
  walletDb = new WalletPrismaService();
  orderDb = new OrderDb();
  // Earlier suites leave durable events in the same disposable DB. They are outside this run's exchange.
  await paymentDb.client.outboxEvent.updateMany({
    where: { status: 'pending' },
    data: { status: 'published' },
  });
  await walletDb.outboxEvent.updateMany({
    where: { status: 'pending' },
    data: { status: 'published' },
  });
  const publisherOptions = createRabbitMQOptions(`publisher-${randomUUID()}`);
  publisherOptions.options!.noAck = true;
  const client = ClientProxyFactory.create(publisherOptions);
  await client.connect();
  rabbit = new RabbitMQService(client);
  const ledger = new WalletLedgerService(walletDb);
  const walletClient = new WalletClient(config as never);
  const inbox = new PaymentInboxService(
    paymentDb,
    new RabbitMQContextService(),
  );
  const outbox = new PaymentOutboxService(paymentDb);
  const topups = new TopupsService(
    paymentDb,
    new MockTopupProvider(),
    outbox,
    inbox,
  );
  payouts = new PayoutsService(
    paymentDb,
    walletClient,
    new MockPayoutProvider(),
    new SandboxBankSnapshotProvider(config as never),
    inbox,
  );
  const payments = new PaymentOrdersService(
    paymentDb,
    new OrderEligibilityClient(config as never),
    walletClient,
    outbox,
    new PaymentQueryService(paymentDb),
  );
  const trustApp = await appFor([SandboxBankFixture], []);
  urls.USER_TRUST_SERVICE_URL = await trustApp.getUrl();
  const walletApp = await appFor(
    [
      PaymentDebitController,
      WithdrawalController,
      TopupSettlementConsumer,
      WorkerCommissionController,
      RefundAdjustmentController,
    ],
    [
      {
        provide: RefundAdjustmentService,
        useValue: new RefundAdjustmentService(ledger),
      },
      {
        provide: PaymentDebitService,
        useValue: new PaymentDebitService(ledger),
      },
      {
        provide: WithdrawalService,
        useValue: new WithdrawalService(
          walletDb,
          new HttpBankAccountVerifier(config as never),
        ),
      },
      {
        provide: TopupSettlementService,
        useValue: new TopupSettlementService(walletDb),
      },
      ConsumerRetryService,
      {
        provide: WorkerCommissionService,
        useValue: new WorkerCommissionService(ledger),
      },
    ],
    walletQueue,
  );
  walletConsumer = walletApp.getMicroservices()[0];
  urls.WALLET_SERVICE_URL = await walletApp.getUrl();
  const orderApp = await appFor(
    [InternalOrderController, PaymentEventsConsumer],
    [
      { provide: OrderDb, useValue: orderDb },
      InternalSecretGuard,
      InternalOrderService,
      ConsumedEventRepository,
    ],
    `order-cross-${randomUUID()}`,
  );
  urls.ORDER_SERVICE_URL = await orderApp.getUrl();
  const paymentApp = await appFor(
    [
      PaymentOrdersController,
      TopupIpnController,
      TopupsController,
      WalletTopupEventsConsumer,
      PayoutEventsConsumer,
      PayoutAdminController,
      RefundsController,
    ],
    [
      {
        provide: RefundsService,
        useValue: new RefundsService(
          paymentDb,
          new AdminAuditService(paymentDb),
          walletClient,
          outbox,
        ),
      },
      { provide: PaymentOrdersService, useValue: payments },
      { provide: TopupsService, useValue: topups },
      { provide: PaymentInboxService, useValue: inbox },
      { provide: PayoutsService, useValue: payouts },
    ],
    `payment-cross-${randomUUID()}`,
  );
  urls.PAYMENT_SERVICE_URL = await paymentApp.getUrl();
  paymentPublisher = new OutboxPublisherService(
    new PaymentOutboxRepository(paymentDb),
    rabbit,
  );
  walletPublisher = new OutboxPublisherService(
    new WalletOutboxRepository(walletDb),
    rabbit,
  );
  const gatewayApp = await appFor([], []);
  const auth = new GatewayAuthMiddleware(
    gatewayApp.get(TokenVerifierService),
    config as never,
  );
  const proxy = new ProxyMiddleware(config as never);
  // Gateway middleware needs to precede Nest's fallback handler.
  await gatewayApp.close();
  apps.pop();
  const gatewayModule = await Test.createTestingModule({}).compile();
  const gatewayInstance = gatewayModule.createNestApplication();
  apps.push(gatewayInstance);
  gatewayInstance.use(auth.use.bind(auth));
  gatewayInstance.use(proxy.use.bind(proxy));
  await gatewayInstance.listen(0, '127.0.0.1');
  gateway = await gatewayInstance.getUrl();
  await walletDb.wallet.createMany({
    data: [
      { userId: customer, balance: 1000n },
      { userId: worker, balance: 100n },
    ],
  });
  await walletDb.wallet.upsert({
    where: { systemKey: 'PLATFORM_FEES' },
    create: { systemKey: 'PLATFORM_FEES', balance: 1000n },
    update: { balance: 1000n },
  });
  ruleId = (
    await paymentDb.client.commissionRule.create({
      data: {
        createdByUserId: randomUUID(),
        ratePercent: '10',
        effectiveFrom: new Date('2010-01-01'),
        effectiveTo: new Date('2010-01-02'),
        isActive: false,
      },
    })
  ).id;
});

afterAll(async () => {
  for (const app of apps.reverse()) await app.close();
  if (rabbit) await rabbit.onModuleDestroy();
  if (paymentDb) {
    const ids = (
      await paymentDb.client.payment.findMany({
        where: { customerUserId: customer },
        select: { id: true },
      })
    ).map((row) => row.id);
    await paymentDb.client.refund.deleteMany({
      where: { paymentId: { in: ids } },
    });
    await paymentDb.client.paymentAttempt.deleteMany({
      where: { paymentId: { in: ids } },
    });
    await paymentDb.client.paymentSettlement.deleteMany({
      where: { paymentId: { in: ids } },
    });
    await paymentDb.client.commissionReceivable.deleteMany({
      where: { paymentId: { in: ids } },
    });
    await paymentDb.client.payment.deleteMany({ where: { id: { in: ids } } });
    if (ruleId)
      await paymentDb.client.commissionRule.deleteMany({
        where: { id: ruleId },
      });
    await paymentDb.onModuleDestroy();
  }
  if (walletDb) await walletDb.$disconnect();
  if (orderDb) await orderDb.$disconnect();
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function orderPayment(method: 'point' | 'cash') {
  const serviceId = randomUUID();
  const request = await orderDb.serviceRequest.create({
    data: {
      requestCode: randomUUID().slice(0, 24),
      customerUserId: customer,
      serviceId,
    },
  });
  const proposal = await orderDb.bookingProposal.create({
    data: {
      serviceRequestId: request.id,
      customerUserId: customer,
      workerUserId: worker,
      selectionSource: 'bid',
      agreedPrice: '100',
      agreedScope: 'Test',
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const order = await orderDb.order.create({
    data: {
      orderCode: randomUUID().slice(0, 24),
      serviceRequestId: request.id,
      bookingProposalId: proposal.id,
      customerUserId: customer,
      workerUserId: worker,
      serviceId,
      selectionSource: 'bid',
      agreedPrice: '100',
      agreedScope: 'Test',
      addressText: 'Sandbox',
      latitude: 10,
      longitude: 106,
      status: 'completed',
    },
  });
  return paymentDb.client.payment.create({
    data: {
      orderId: order.id,
      customerUserId: customer,
      workerUserId: worker,
      amount: 100n,
      platformFee: 10n,
      workerEarning: 90n,
      commissionRatePercent: '10',
      commissionRuleId: ruleId,
      method,
      orderCompletedAt: new Date(),
    },
  });
}

describe('Gateway + real HTTP + RabbitMQ + isolated service schemas', () => {
  it('mock failure never credits; simulation requires owner JWT and is disabled in production', async () => {
    const topup = await call('/payments/topups', {
      amountVnd: 10000,
      idempotencyKey: randomUUID(),
    });
    const endpoint = `${gateway}/api/v1/payments/topups/${topup.id}/simulate`;
    const body = JSON.stringify({
      outcome: 'succeeded',
      confirmSimulated: true,
    });
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token(worker)}`,
          },
          body,
        })
      ).status,
    ).toBe(404);
    setEnv('NODE_ENV', 'production');
    try {
      expect(
        (
          await fetch(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${token()}`,
            },
            body,
          })
        ).status,
      ).toBe(403);
    } finally {
      setEnv('NODE_ENV', 'test');
    }
    expect(
      (
        await call(`/payments/topups/${topup.id}/simulate`, {
          outcome: 'failed',
          confirmSimulated: true,
        })
      ).status,
    ).toBe('failed');
    expect(
      await walletDb.walletTransaction.count({
        where: { type: 'topup', referenceId: topup.id },
      }),
    ).toBe(0);
    expect(
      await paymentDb.client.outboxEvent.count({
        where: { aggregateId: topup.id },
      }),
    ).toBe(0);
  });
  it('mock confirmation reaches real Wallet via broker and completes only after ACK; duplicate never credits twice', async () => {
    const before = (
      await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })
    ).balance;
    const topup = await call('/payments/topups', {
      amountVnd: 10000,
      idempotencyKey: randomUUID(),
    });
    expect(topup).toMatchObject({ provider: 'mock', isSimulated: true });
    expect(topup.checkoutUrl).toMatch(/^mock:\/\/topup\/MOCK-/);
    expect(
      (
        await call(`/payments/topups/${topup.id}/simulate`, {
          outcome: 'succeeded',
          confirmSimulated: true,
        })
      ).status,
    ).toBe('credit_pending');
    expect(
      (
        await paymentDb.client.topupRequest.findUniqueOrThrow({
          where: { id: topup.id },
        })
      ).status,
    ).toBe('credit_pending');
    await paymentPublisher.publishPendingEvents();
    await eventually(
      async () =>
        (await walletDb.walletTransaction.count({
          where: { type: 'topup', referenceId: topup.id },
        })) === 1,
    );
    for (let i = 0; i < 3; i++) await walletPublisher.publishPendingEvents();
    await eventually(
      async () =>
        (
          await paymentDb.client.topupRequest.findUniqueOrThrow({
            where: { id: topup.id },
          })
        ).status === 'completed',
    );
    expect(
      (
        await call(`/payments/topups/${topup.id}/simulate`, {
          outcome: 'succeeded',
          confirmSimulated: true,
        })
      ).status,
    ).toBe('completed');
    expect(
      await (
        await fetch(
          `${gateway}/api/v1/payments/topups/vnpay/ipn?vnp_SecureHash=invalid`,
        )
      ).json(),
    ).toMatchObject({ RspCode: '97' });
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } }))
        .balance,
    ).toBe(before + 10000n);
  });

  it.each(['point', 'cash'] as const)(
    '%s settlement updates Order over RabbitMQ, then replay succeeds after paid',
    async (method) => {
      const payment = await orderPayment(method);
      await call('/payments', { orderId: payment.orderId, method });
      const beforeWorker = (
        await walletDb.wallet.findUniqueOrThrow({ where: { userId: worker } })
      ).balance;
      if (method === 'point')
        await call(`/payments/${payment.id}/pay-with-points`, {
          confirm: true,
        });
      else await call(`/payments/${payment.id}/confirm-cash`, {}, worker);
      for (let i = 0; i < 3; i++) await paymentPublisher.publishPendingEvents();
      await eventually(
        async () =>
          (
            await orderDb.order.findUniqueOrThrow({
              where: { id: payment.orderId },
            })
          ).paymentState === 'paid',
      );
      expect(
        (await call('/payments', { orderId: payment.orderId, method })).id,
      ).toBe(payment.id);
      expect(
        (await walletDb.wallet.findUniqueOrThrow({ where: { userId: worker } }))
          .balance,
      ).toBe(method === 'point' ? beforeWorker + 90n : beforeWorker - 10n);
      const beforeRefund = (
        await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })
      ).balance;
      for (const amount of ['40', '60']) {
        const refund = await call(`/payments/${payment.id}/refunds`, {
          amount,
          reason: 'Sandbox dispute',
          idempotencyKey: randomUUID(),
        });
        const decision = {
          approve: true,
          reason: 'Independent Admin approval',
        };
        expect(
          (
            await call(
              `/payments/admin/refunds/${refund.id}/decision`,
              decision,
              admin,
            )
          ).status,
        ).toBe('completed');
        expect(
          (
            await call(
              `/payments/admin/refunds/${refund.id}/decision`,
              decision,
              admin,
            )
          ).status,
        ).toBe('completed');
        expect(
          await paymentDb.client.outboxEvent.count({
            where: { aggregateId: refund.id, eventType: 'payment.refunded' },
          }),
        ).toBe(1);
      }
      expect(
        (
          await walletDb.wallet.findUniqueOrThrow({
            where: { userId: customer },
          })
        ).balance,
      ).toBe(beforeRefund + 100n);
      expect(
        (
          await paymentDb.client.payment.findUniqueOrThrow({
            where: { id: payment.id },
          })
        ).status,
      ).toBe('refunded');
    },
  );

  it('retains a mock-confirmed top-up while Wallet consumer is offline; restart and duplicate delivery credit once', async () => {
    await walletConsumer.close();
    const topup = await call('/payments/topups', {
      amountVnd: 10000,
      idempotencyKey: randomUUID(),
    });
    await call(`/payments/topups/${topup.id}/simulate`, {
      outcome: 'succeeded',
      confirmSimulated: true,
    });
    await paymentPublisher.publishPendingEvents();
    expect(
      (
        await paymentDb.client.topupRequest.findUniqueOrThrow({
          where: { id: topup.id },
        })
      ).status,
    ).toBe('credit_pending');
    expect(
      await walletDb.walletTransaction.count({
        where: { referenceId: topup.id, type: 'topup' },
      }),
    ).toBe(0);
    const event = await paymentDb.client.outboxEvent.findFirstOrThrow({
      where: { aggregateId: topup.id, eventType: 'payment.topup.succeeded' },
    });
    await rabbit.emit(event.eventType, {
      ...(event.payload as object),
      eventId: event.id,
    });
    const restarted = await appFor(
      [TopupSettlementConsumer],
      [
        {
          provide: TopupSettlementService,
          useValue: new TopupSettlementService(walletDb),
        },
        ConsumerRetryService,
      ],
      walletQueue,
    );
    walletConsumer = restarted.getMicroservices()[0];
    await eventually(
      async () =>
        (await walletDb.walletTransaction.count({
          where: { referenceId: topup.id, type: 'topup' },
        })) === 1,
    );
    for (let i = 0; i < 5; i++) await walletPublisher.publishPendingEvents();
    await eventually(
      async () =>
        (
          await paymentDb.client.topupRequest.findUniqueOrThrow({
            where: { id: topup.id },
          })
        ).status === 'completed',
    );
    expect(
      await walletDb.walletTransaction.count({
        where: { referenceId: topup.id, type: 'topup' },
      }),
    ).toBe(1);
  });

  it.each(['succeeded', 'failed', 'unknown'] as const)(
    'withdrawal %s uses real hold, claim, capture/release and simulated bank send',
    async (outcome) => {
      setEnv('PAYOUT_MOCK_OUTCOME', outcome);
      const before = await walletDb.wallet.findUniqueOrThrow({
        where: { userId: customer },
      });
      const withdrawal = await call('/wallets/me/withdrawals', {
        amount: '100',
        bankAccountId: bank,
        idempotencyKey: randomUUID(),
      });
      for (let i = 0; i < 5; i++) await walletPublisher.publishPendingEvents();
      await eventually(
        async () =>
          !!(await paymentDb.client.payout.findUnique({
            where: { withdrawalId: withdrawal.id },
          })),
      );
      await payouts.processBatch();
      await payouts.processBatch();
      const payout = await paymentDb.client.payout.findUniqueOrThrow({
        where: { withdrawalId: withdrawal.id },
      });
      const after = await walletDb.wallet.findUniqueOrThrow({
        where: { userId: customer },
      });
      expect(payout).toMatchObject({
        provider: 'mock',
        isSimulated: true,
        status:
          outcome === 'succeeded'
            ? 'completed'
            : outcome === 'failed'
              ? 'failed'
              : 'needs_review',
      });
      expect(after.balance).toBe(
        before.balance - (outcome === 'succeeded' ? 100n : 0n),
      );
      expect(after.reservedBalance).toBe(
        before.reservedBalance + (outcome === 'unknown' ? 100n : 0n),
      );
      expect(
        await paymentDb.client.payoutAttempt.count({
          where: { payoutId: payout.id },
        }),
      ).toBe(1);
      if (outcome === 'unknown') {
        expect(
          await call(
            `/payments/admin/operations/payouts/${payout.id}/resolve-sandbox`,
            {
              status: 'failed',
              reason: 'Sandbox operator resolved uncertain mock as failed',
              confirmSimulated: true,
            },
            admin,
          ),
        ).toMatchObject({
          status: 'failed',
          provider: 'mock',
          isSimulated: true,
        });
        expect(
          (
            await walletDb.wallet.findUniqueOrThrow({
              where: { userId: customer },
            })
          ).reservedBalance,
        ).toBe(before.reservedBalance);
        expect(
          await paymentDb.client.payoutAttempt.count({
            where: { payoutId: payout.id },
          }),
        ).toBe(1);
      }
    },
  );

  it('cancel before claim releases the hold and prevents dispatch', async () => {
    const before = await walletDb.wallet.findUniqueOrThrow({
      where: { userId: customer },
    });
    const withdrawal = await call('/wallets/me/withdrawals', {
      amount: '100',
      bankAccountId: bank,
      idempotencyKey: randomUUID(),
    });
    await call(`/wallets/me/withdrawals/${withdrawal.id}/cancel`, {});
    for (let i = 0; i < 5; i++) await walletPublisher.publishPendingEvents();
    await eventually(
      async () =>
        !!(await paymentDb.client.payout.findUnique({
          where: { withdrawalId: withdrawal.id },
        })),
    );
    await payouts.processBatch();
    const payout = await paymentDb.client.payout.findUniqueOrThrow({
      where: { withdrawalId: withdrawal.id },
    });
    expect(
      await paymentDb.client.payoutAttempt.count({
        where: { payoutId: payout.id },
      }),
    ).toBe(0);
    const after = await walletDb.wallet.findUniqueOrThrow({
      where: { userId: customer },
    });
    expect(after.balance).toBe(before.balance);
    expect(after.reservedBalance).toBe(before.reservedBalance);
  });

  it('concurrent cancel and claim have one final money outcome without negative holds or duplicate sends', async () => {
    setEnv('PAYOUT_MOCK_OUTCOME', 'succeeded');
    for (let run = 0; run < 3; run++) {
      const before = await walletDb.wallet.findUniqueOrThrow({
        where: { userId: customer },
      });
      const withdrawal = await call('/wallets/me/withdrawals', {
        amount: '100',
        bankAccountId: bank,
        idempotencyKey: randomUUID(),
      });
      for (let i = 0; i < 5; i++) await walletPublisher.publishPendingEvents();
      await eventually(
        async () =>
          !!(await paymentDb.client.payout.findUnique({
            where: { withdrawalId: withdrawal.id },
          })),
      );
      await Promise.all([
        fetch(
          `${gateway}/api/v1/wallets/me/withdrawals/${withdrawal.id}/cancel`,
          { method: 'POST', headers: { authorization: `Bearer ${token()}` } },
        ),
        payouts.processBatch(),
      ]);
      await payouts.processBatch();
      const final = await walletDb.withdrawal.findUniqueOrThrow({
        where: { id: withdrawal.id },
      });
      expect(['cancelled', 'succeeded']).toContain(final.status);
      const after = await walletDb.wallet.findUniqueOrThrow({
        where: { userId: customer },
      });
      expect(after.reservedBalance).toBe(before.reservedBalance);
      expect(after.balance).toBe(
        before.balance - (final.status === 'succeeded' ? 100n : 0n),
      );
      const payout = await paymentDb.client.payout.findUniqueOrThrow({
        where: { withdrawalId: withdrawal.id },
      });
      expect(
        await paymentDb.client.payoutAttempt.count({
          where: { payoutId: payout.id },
        }),
      ).toBe(final.status === 'succeeded' ? 1 : 0);
    }
  });
});
