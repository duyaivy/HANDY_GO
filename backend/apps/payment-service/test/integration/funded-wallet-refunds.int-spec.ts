import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@app/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentPrismaService } from '../../src/common/database/payment-prisma.service.js';
import { AdminAuditService } from '../../src/common/audit/admin-audit.service.js';
import { PaymentOutboxService } from '../../src/common/outbox/payment-outbox.service.js';
import { WalletClient } from '../../src/common/clients/wallet.client.js';
import { RefundsService } from '../../src/refunds/refunds.service.js';
import { DisputeRefundService } from '../../src/order-events/dispute-refund.service.js';
import { PaymentInboxService } from '../../src/common/inbound/payment-inbox.service.js';
import { PaymentQueryService } from '../../src/payment-query/payment-query.service.js';
import { PrismaService as OrderPrismaService } from '../../../order-service/src/prisma/prisma.service.js';
import { OrdersService } from '../../../order-service/src/orders/orders.service.js';
import { OrderOutboxRepository } from '../../../order-service/src/common/outbox/order-outbox.repository.js';
import { PaymentEventsConsumer } from '../../../order-service/src/consumers/payment-events.consumer.js';
import { ConsumedEventRepository } from '../../../order-service/src/common/inbox/consumed-event.repository.js';
import { DisputeRefundReconciliationService } from '../../../order-service/src/common/inbox/dispute-refund-reconciliation.service.js';
import { WalletPrismaService } from '../../../wallet-service/src/wallet-ledger/wallet-prisma.service.js';
import { WalletLedgerService } from '../../../wallet-service/src/wallet-ledger/wallet-ledger.service.js';
import { RefundAdjustmentService } from '../../../wallet-service/src/refund-adjustment/refund-adjustment.service.js';
import { RefundAdjustmentController } from '../../../wallet-service/src/refund-adjustment/refund-adjustment.controller.js';
import { PaymentDebitController } from '../../../wallet-service/src/payment-debit/payment-debit.controller.js';
import { PaymentDebitService } from '../../../wallet-service/src/payment-debit/payment-debit.service.js';
import { BigIntSerializerInterceptor } from '../../../wallet-service/src/common/interceptors/bigint-serializer.interceptor.js';

let app: INestApplication;
let paymentDb: PaymentPrismaService, walletDb: WalletPrismaService, orderDb: OrderPrismaService;
let refunds: RefundsService, ledger: WalletLedgerService;
let walletConfig: ConstructorParameters<typeof WalletClient>[0];
const admin = randomUUID(),
  customer = randomUUID(),
  worker = randomUUID();
const payments: string[] = [];
const originalWalletUrl = process.env.DATABASE_URL_WALLET;
const originalOrderUrl = process.env.DATABASE_URL_ORDER;
const ruleId = randomUUID();
let platformId: string;

beforeAll(async () => {
  const raw = process.env.PAYMENT_TEST_DATABASE_URL;
  if (!raw) throw new Error('PAYMENT_TEST_DATABASE_URL required');
  const url = new URL(raw);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/handygo_hg51_payment_test'
  )
    throw new Error('Isolated test DB required');
  process.env.DATABASE_URL_WALLET = raw;
  process.env.DATABASE_URL_ORDER = raw;
  walletDb = new WalletPrismaService();
  paymentDb = new PaymentPrismaService();
  orderDb = new OrderPrismaService();
  ledger = new WalletLedgerService(walletDb);
  const config = {
    internalServiceSecret: 'isolated-refund-test-secret',
    apiPrefix: 'api/v1',
    upstreamTimeoutMs: 3000,
    getUrl: () => '',
  };
  const module = await Test.createTestingModule({
    controllers: [RefundAdjustmentController, PaymentDebitController],
    providers: [
      { provide: ConfigService, useValue: config },
      {
        provide: RefundAdjustmentService,
        useValue: new RefundAdjustmentService(ledger),
      },
      {
        provide: PaymentDebitService,
        useValue: new PaymentDebitService(ledger),
      },
    ],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  config.getUrl = () => origin;
  walletConfig = config as never;
  refunds = new RefundsService(
    paymentDb,
    new AdminAuditService(paymentDb),
    new WalletClient(config as never),
    new PaymentOutboxService(paymentDb),
  );
  platformId = (
    await walletDb.wallet.upsert({
      where: { systemKey: 'PLATFORM_FEES' },
      create: { systemKey: 'PLATFORM_FEES', balance: 1000n },
      update: { balance: 1000n },
    })
  ).id;
  await walletDb.wallet.createMany({
    data: [{ userId: customer, balance: 1000n }, { userId: worker }],
  });
  await paymentDb.client.commissionRule.create({
    data: {
      id: ruleId,
      createdByUserId: admin,
      isActive: false,
      ratePercent: '10',
      effectiveFrom: new Date('2000-01-01'),
      effectiveTo: new Date('2000-01-02'),
    },
  });
});

afterAll(async () => {
  if (app) await app.close();
  if (paymentDb) {
    await paymentDb.client.refund.deleteMany({
      where: { paymentId: { in: payments } },
    });
    await paymentDb.client.payment.deleteMany({
      where: { id: { in: payments } },
    });
    await paymentDb.client.commissionRule.deleteMany({ where: { id: ruleId } });
    await paymentDb.client.adminAuditLog.deleteMany({
      where: { actorUserId: admin },
    });
    await paymentDb.onModuleDestroy();
  }
  if (walletDb) await walletDb.$disconnect();
  if (orderDb) await orderDb.$disconnect();
  if (originalWalletUrl === undefined) delete process.env.DATABASE_URL_WALLET;
  else process.env.DATABASE_URL_WALLET = originalWalletUrl;
  if (originalOrderUrl === undefined) delete process.env.DATABASE_URL_ORDER;
  else process.env.DATABASE_URL_ORDER = originalOrderUrl;
});

async function settled(method: 'point' | 'cash') {
  const row = await paymentDb.client.payment.create({
    data: {
      orderId: randomUUID(),
      customerUserId: customer,
      workerUserId: worker,
      amount: 100n,
      platformFee: 10n,
      workerEarning: 90n,
      commissionRatePercent: '10',
      commissionRuleId: ruleId,
      status: 'succeeded',
      method,
    },
  });
  payments.push(row.id);
  if (method === 'point')
    await new PaymentDebitService(ledger).debit(customer, {
      paymentId: row.id,
      attemptId: randomUUID(),
      workerUserId: worker,
      grossAmount: '100',
      workerEarning: '90',
      platformFee: '10',
    });
  return row;
}

describe('Funded refunds using real Payment/Wallet DB and internal HTTP', () => {
  it('keeps Order disputed until a real Payment/Wallet refund outcome is consumed once', async () => {
    const payment = await settled('point');
    const serviceId = randomUUID();
    const request = await orderDb.serviceRequest.create({ data: {
      requestCode: randomUUID().slice(0, 24), customerUserId: customer, serviceId,
    } });
    const proposal = await orderDb.bookingProposal.create({ data: {
      serviceRequestId: request.id, customerUserId: customer, workerUserId: worker,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test',
      expiresAt: new Date(Date.now() + 60000),
    } });
    const completedAt = new Date(Date.now() - 86400000);
    const order = await orderDb.order.create({ data: {
      id: payment.orderId, orderCode: randomUUID().slice(0, 24),
      serviceRequestId: request.id, bookingProposalId: proposal.id,
      customerUserId: customer, workerUserId: worker, serviceId,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test',
      addressText: 'Test', latitude: 10, longitude: 106,
      status: 'disputed', paymentState: 'paid', disputePreviousStatus: 'completed',
      disputedAt: new Date(), completedAt, firstCompletedAt: completedAt,
    } });
    const orderOutbox = new OrderOutboxRepository(orderDb);
    const query = new PaymentQueryService(paymentDb);
    const orderService = new OrdersService(orderDb, orderOutbox, {
      byOrder: async (id: string) => {
        const result = await query.refundableByOrder(id);
        return { ...result, refundableAmountVnd: BigInt(result.refundableAmountVnd) };
      },
      cancelDisputeRefundForOverride: (resId: string, body: { orderId: string; adminUserId: string; reason: string }) =>
        refunds.cancelDisputeRefundForOverride(resId, body),
    } as never);
    const dto = { action: 'refund' as const, resolutionNote: 'Hoàn tiền sau khiếu nại', idempotencyKey: randomUUID() };
    const candidates = [dto, { ...dto, idempotencyKey: randomUUID() }];
    const attempts = await Promise.allSettled(candidates.map((candidate) =>
      orderService.resolveCompletedDispute(order.id, admin, candidate, ['Admin'])));
    const winners = attempts.filter((result) => result.status === 'fulfilled');
    const losers = attempts.filter((result) => result.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect((losers[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    const decision = (winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof orderService.resolveCompletedDispute>>>).value;
    const winningDto = candidates[attempts.findIndex((result) => result.status === 'fulfilled')];
    expect(decision.state).toBe('refund_pending');
    expect((await orderDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('disputed');
    await expect(orderDb.orderDisputeResolution.create({ data: {
      orderId: order.id, disputedAt: order.disputedAt!, idempotencyKey: randomUUID(),
      requestHash: 'x'.repeat(64), adminUserId: admin, action: 'refund',
      resolutionNote: 'Quyết định thứ hai', state: 'refund_pending',
      refundAmountVnd: 100n, paymentId: payment.id,
    } })).rejects.toMatchObject({ code: 'P2002' });
    const decisionEvent = await orderDb.outboxEvent.findFirstOrThrow({ where: {
      aggregateId: order.id, eventType: 'order.dispute.decision.recorded',
    } });

    const paymentOutbox = new PaymentOutboxService(paymentDb);
    const inbox = new PaymentInboxService(paymentDb, {} as never);
    const dispute = new DisputeRefundService(inbox, paymentDb, paymentOutbox,
      new AdminAuditService(paymentDb), refunds);
    dispute.onModuleInit();
    const inbound = { eventId: decisionEvent.id, payload: decisionEvent.payload };
    expect(await inbox.handle('order.dispute.decision.recorded', inbound)).toBe('processed');
    expect(await inbox.handle('order.dispute.decision.recorded', inbound)).toBe('duplicate');
    const reserved = await paymentDb.client.refund.findUniqueOrThrow({ where: { disputeResolutionId: decision.resolutionId } });
    expect(reserved.status).toBe('needs_review');
    expect((await orderDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('disputed');

    await refunds.execute(reserved.id);
    const outcome = await paymentDb.client.outboxEvent.findFirstOrThrow({ where: {
      eventType: 'payment.dispute.refund.completed',
      payload: { path: ['resolutionId'], equals: decision.resolutionId },
    } });
    const consumer = new PaymentEventsConsumer(orderDb, new ConsumedEventRepository(orderDb), orderOutbox);
    const envelope = { eventId: outcome.id, payload: outcome.payload };
    await consumer.handleDisputeRefundCompleted(envelope);
    await consumer.handleDisputeRefundCompleted(envelope);
    const final = await orderDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.status).toBe('completed');
    expect(final.paymentState).toBe('refunded');
    expect(await orderDb.outboxEvent.count({ where: { aggregateId: order.id, eventType: 'order.dispute.resolved' } })).toBe(1);
    // Policy check: fully refunded order cannot open a new dispute even within 7 days
    await expect(
      orderService.dispute(order.id, customer, { reason: 'Thử khiếu nại lại sau khi hoàn 100%' }),
    ).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'ORDER_ALREADY_FULLY_REFUNDED' }) });
    const replay = await orderService.resolveCompletedDispute(order.id, admin, winningDto, ['Admin']);
    expect(replay.resolutionId).toBe(decision.resolutionId);
    expect(await paymentDb.client.refund.count({ where: { disputeResolutionId: decision.resolutionId } })).toBe(1);
  });

  it('releases reservation after verified Wallet 4xx rejection and completes Admin override with smaller refund', async () => {
    const payment = await settled('cash');
    await walletDb.wallet.update({ where: { id: platformId }, data: { balance: 50n } });
    const serviceId = randomUUID();
    const request = await orderDb.serviceRequest.create({ data: {
      requestCode: randomUUID().slice(0, 24), customerUserId: customer, serviceId,
    } });
    const proposal = await orderDb.bookingProposal.create({ data: {
      serviceRequestId: request.id, customerUserId: customer, workerUserId: worker,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test 4xx override',
      expiresAt: new Date(Date.now() + 60000),
    } });
    const completedAt = new Date(Date.now() - 86400000);
    const order = await orderDb.order.create({ data: {
      id: payment.orderId, orderCode: randomUUID().slice(0, 24),
      serviceRequestId: request.id, bookingProposalId: proposal.id,
      customerUserId: customer, workerUserId: worker, serviceId,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test 4xx override',
      addressText: 'Test', latitude: 10, longitude: 106,
      status: 'disputed', paymentState: 'paid', disputePreviousStatus: 'completed',
      disputedAt: new Date(), completedAt, firstCompletedAt: completedAt,
    } });
    const orderOutbox = new OrderOutboxRepository(orderDb);
    const query = new PaymentQueryService(paymentDb);
    const orderService = new OrdersService(orderDb, orderOutbox, {
      byOrder: async (id: string) => {
        const result = await query.refundableByOrder(id);
        return { ...result, refundableAmountVnd: BigInt(result.refundableAmountVnd) };
      },
      cancelDisputeRefundForOverride: (resId: string, body: { orderId: string; adminUserId: string; reason: string }) =>
        refunds.cancelDisputeRefundForOverride(resId, body),
    } as never);
    const paymentOutbox = new PaymentOutboxService(paymentDb);
    const inbox = new PaymentInboxService(paymentDb, {} as never);
    const dispute = new DisputeRefundService(inbox, paymentDb, paymentOutbox, new AdminAuditService(paymentDb), refunds);
    dispute.onModuleInit();
    const consumer = new PaymentEventsConsumer(orderDb, new ConsumedEventRepository(orderDb), orderOutbox);

    // 1. First decision: 100 VND exceeds PLATFORM_FEES balance (50) -> Wallet rejects 409
    const first = await orderService.resolveCompletedDispute(order.id, admin, {
      action: 'refund', resolutionNote: 'Hoàn 100k lần đầu', refundAmountVnd: '100', idempotencyKey: randomUUID(),
    }, ['Admin']);
    const firstEvent = await orderDb.outboxEvent.findFirstOrThrow({
      where: { aggregateId: order.id, eventType: 'order.dispute.decision.recorded' },
    });
    expect(await inbox.handle('order.dispute.decision.recorded', { eventId: firstEvent.id, payload: firstEvent.payload })).toBe('processed');
    const firstRefund = await paymentDb.client.refund.findUniqueOrThrow({ where: { disputeResolutionId: first.resolutionId } });
    await refunds.execute(firstRefund.id);

    // Refund must be terminal failed and reservation released!
    expect((await paymentDb.client.refund.findUniqueOrThrow({ where: { id: firstRefund.id } })).status).toBe('failed');
    expect((await query.refundableByOrder(order.id)).refundableAmountVnd).toBe('100');

    const needsReviewEvent = await paymentDb.client.outboxEvent.findFirstOrThrow({
      where: { eventType: 'payment.dispute.refund.needs_review', payload: { path: ['resolutionId'], equals: first.resolutionId } },
    });
    await consumer.handleDisputeRefundNeedsReview({ eventId: needsReviewEvent.id, payload: needsReviewEvent.payload });
    expect((await orderDb.orderDisputeResolution.findUniqueOrThrow({ where: { id: first.resolutionId } })).state).toBe('needs_review');

    // 2. Admin overrides with smaller refund (40 VND) -> succeeds end-to-end!
    const customerBefore = (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })).balance;
    const second = await orderService.resolveCompletedDispute(order.id, admin, {
      action: 'refund', resolutionNote: 'Override hoàn 40k theo quỹ khả dụng', refundAmountVnd: '40', idempotencyKey: randomUUID(),
    }, ['Admin']);
    expect((await orderDb.orderDisputeResolution.findUniqueOrThrow({ where: { id: first.resolutionId } })).state).toBe('superseded');
    const secondEvent = await orderDb.outboxEvent.findFirstOrThrow({
      where: { aggregateId: order.id, eventType: 'order.dispute.decision.recorded', payload: { path: ['resolutionId'], equals: second.resolutionId } },
    });
    expect(await inbox.handle('order.dispute.decision.recorded', { eventId: secondEvent.id, payload: secondEvent.payload })).toBe('processed');
    const secondRefund = await paymentDb.client.refund.findUniqueOrThrow({ where: { disputeResolutionId: second.resolutionId } });
    await refunds.execute(secondRefund.id);

    const completedEvent = await paymentDb.client.outboxEvent.findFirstOrThrow({
      where: { eventType: 'payment.dispute.refund.completed', payload: { path: ['resolutionId'], equals: second.resolutionId } },
    });
    await consumer.handleDisputeRefundCompleted({ eventId: completedEvent.id, payload: completedEvent.payload });

    const finalOrder = await orderDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe('completed');
    expect(finalOrder.paymentState).toBe('partially_refunded');
    expect((await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })).balance).toBe(customerBefore + 40n);
    expect((await query.refundableByOrder(order.id)).refundableAmountVnd).toBe('60');
    await walletDb.wallet.update({ where: { id: platformId }, data: { balance: 1000n } });
  });

  it('parks mismatched payment outcome durably and replays original eventId once after repair', async () => {
    const payment = await settled('point');
    const serviceId = randomUUID();
    const request = await orderDb.serviceRequest.create({ data: {
      requestCode: randomUUID().slice(0, 24), customerUserId: customer, serviceId,
    } });
    const proposal = await orderDb.bookingProposal.create({ data: {
      serviceRequestId: request.id, customerUserId: customer, workerUserId: worker,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test replay',
      expiresAt: new Date(Date.now() + 60000),
    } });
    const completedAt = new Date(Date.now() - 86400000);
    const order = await orderDb.order.create({ data: {
      id: payment.orderId, orderCode: randomUUID().slice(0, 24),
      serviceRequestId: request.id, bookingProposalId: proposal.id,
      customerUserId: customer, workerUserId: worker, serviceId,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test replay',
      addressText: 'Test', latitude: 10, longitude: 106,
      status: 'in_progress', paymentState: 'paid', disputePreviousStatus: 'completed',
      disputedAt: new Date(), completedAt, firstCompletedAt: completedAt,
    } });
    const resolutionId = randomUUID();
    await orderDb.orderDisputeResolution.create({ data: {
      id: resolutionId, orderId: order.id, disputedAt: order.disputedAt!,
      idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64), adminUserId: admin,
      action: 'refund', resolutionNote: 'Hoàn 100k', state: 'refund_pending',
      refundAmountVnd: 100n, paymentId: payment.id,
    } });
    const orderOutbox = new OrderOutboxRepository(orderDb);
    const consumedRepo = new ConsumedEventRepository(orderDb);
    const reconService = new DisputeRefundReconciliationService(orderDb, consumedRepo, orderOutbox);
    const consumer = new PaymentEventsConsumer(orderDb, consumedRepo, orderOutbox, reconService);
    const originalEventId = randomUUID();
    const fakeRefundId = randomUUID();

    // Order is temporarily not 'disputed' -> event must be parked, NOT consumed
    await consumer.handleDisputeRefundCompleted({
      eventId: originalEventId,
      payload: { resolutionId, orderId: order.id, paymentId: payment.id, refundId: fakeRefundId, refundAmountVnd: '100', paymentStatus: 'refunded' },
    });
    expect(await consumedRepo.isEventConsumed(originalEventId)).toBe(false);
    expect(await orderDb.inboundEventReconciliation.findUniqueOrThrow({ where: { eventId: originalEventId } })).toMatchObject({
      classification: 'recoverable', reasonCode: 'ORDER_STATUS_NOT_DISPUTED', status: 'pending_reconciliation',
    });

    // Repair order status & replay original eventId via Admin reconciliation service
    await orderDb.order.update({ where: { id: order.id }, data: { status: 'disputed' } });
    const replayed = await reconService.replayEvent(originalEventId, admin, ['Admin']);
    expect(replayed.outcome).toBe('processed');
    expect((await orderDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('completed');
    expect((await orderDb.inboundEventReconciliation.findUniqueOrThrow({ where: { eventId: originalEventId } })).status).toBe('replayed');
    expect(await orderDb.outboxEvent.count({ where: { aggregateId: order.id, eventType: 'order.dispute.resolved' } })).toBe(1);
    await expect(reconService.replayEvent(originalEventId, admin, ['Admin'])).rejects.toMatchObject({ status: 409 });
  });

  it('prevents double-refund when Wallet commits old needs_review refund before Admin override', async () => {
    const payment = await settled('point');
    const serviceId = randomUUID();
    const request = await orderDb.serviceRequest.create({ data: {
      requestCode: randomUUID().slice(0, 24), customerUserId: customer, serviceId,
    } });
    const proposal = await orderDb.bookingProposal.create({ data: {
      serviceRequestId: request.id, customerUserId: customer, workerUserId: worker,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test race',
      expiresAt: new Date(Date.now() + 60000),
    } });
    const completedAt = new Date(Date.now() - 86400000);
    const order = await orderDb.order.create({ data: {
      id: payment.orderId, orderCode: randomUUID().slice(0, 24),
      serviceRequestId: request.id, bookingProposalId: proposal.id,
      customerUserId: customer, workerUserId: worker, serviceId,
      selectionSource: 'bid', agreedPrice: '100', agreedScope: 'Test race',
      addressText: 'Test', latitude: 10, longitude: 106,
      status: 'disputed', paymentState: 'paid', disputePreviousStatus: 'completed',
      disputedAt: new Date(), completedAt, firstCompletedAt: completedAt,
    } });
    const orderOutbox = new OrderOutboxRepository(orderDb);
    const query = new PaymentQueryService(paymentDb);
    const orderService = new OrdersService(orderDb, orderOutbox, {
      byOrder: async (id: string) => {
        const result = await query.refundableByOrder(id);
        return { ...result, refundableAmountVnd: BigInt(result.refundableAmountVnd) };
      },
      cancelDisputeRefundForOverride: (resId: string, body: { orderId: string; adminUserId: string; reason: string }) =>
        refunds.cancelDisputeRefundForOverride(resId, body),
    } as never);

    // 1. Old refund approved in Order & Payment, Wallet commits but response was lost -> Payment stays needs_review
    const first = await orderService.resolveCompletedDispute(order.id, admin, {
      action: 'refund', resolutionNote: 'Hoàn 60k lần đầu', refundAmountVnd: '60', idempotencyKey: randomUUID(),
    }, ['Admin']);
    const paymentOutbox = new PaymentOutboxService(paymentDb);
    const dispute = new DisputeRefundService({} as never, paymentDb, paymentOutbox, new AdminAuditService(paymentDb), refunds);
    await paymentDb.client.$transaction((tx) => dispute.recordDecision({
      action: 'refund', resolutionId: first.resolutionId, orderId: order.id, paymentId: payment.id,
      customerUserId: customer, workerUserId: worker, adminUserId: admin, refundAmountVnd: '60', resolutionNote: 'Hoàn 60k lần đầu',
    }, tx));
    const oldRefund = await paymentDb.client.refund.findUniqueOrThrow({ where: { disputeResolutionId: first.resolutionId } });

    class LostResponseClient extends WalletClient {
      override async refundCredit(...args: Parameters<WalletClient['refundCredit']>) {
        const res = await super.refundCredit(...args);
        return res.outcome === 'ok' ? { outcome: 'unknown' as const, message: 'Lost response' } : res;
      }
    }
    const lostRefunds = new RefundsService(paymentDb, new AdminAuditService(paymentDb), new LostResponseClient(walletConfig), paymentOutbox);
    const beforeBal = (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })).balance;
    await lostRefunds.execute(oldRefund.id);
    // Wallet actually committed 60, Payment still shows needs_review!
    expect((await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })).balance).toBe(beforeBal + 60n);
    expect((await paymentDb.client.refund.findUniqueOrThrow({ where: { id: oldRefund.id } })).status).toBe('needs_review');

    // Simulate Order resolution flagged needs_review, then Admin tries to override with another refund!
    await orderDb.orderDisputeResolution.update({ where: { id: first.resolutionId }, data: { state: 'needs_review' } });
    await expect(
      orderService.resolveCompletedDispute(order.id, admin, {
        action: 'refund', resolutionNote: 'Thử override hoàn 40k mới', refundAmountVnd: '40', idempotencyKey: randomUUID(),
      }, ['Admin']),
    ).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'DISPUTE_REFUND_ALREADY_COMPLETED' }) });

    // Payment reconciled old refund to completed and emitted completion event; Order consumes it and stays in sync!
    expect((await paymentDb.client.refund.findUniqueOrThrow({ where: { id: oldRefund.id } })).status).toBe('completed');
    const reconciledEvent = await paymentDb.client.outboxEvent.findFirstOrThrow({
      where: { eventType: 'payment.dispute.refund.completed', payload: { path: ['resolutionId'], equals: first.resolutionId } },
    });
    const consumer = new PaymentEventsConsumer(orderDb, new ConsumedEventRepository(orderDb), orderOutbox);
    await consumer.handleDisputeRefundCompleted({ eventId: reconciledEvent.id, payload: reconciledEvent.payload });

    const syncedOrder = await orderDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(syncedOrder.status).toBe('completed');
    expect(syncedOrder.paymentState).toBe('partially_refunded');
    expect(await paymentDb.client.refund.count({ where: { paymentId: payment.id } })).toBe(1);
    expect((await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })).balance).toBe(beforeBal + 60n);
  });

  it('completes an HG-82 dispute refund after a real Wallet posting and reuses its resolution ID', async () => {
    const payment = await settled('point');
    const resolutionId = randomUUID();
    const outbox = new PaymentOutboxService(paymentDb);
    const audit = new AdminAuditService(paymentDb);
    const service = new DisputeRefundService({} as never, paymentDb, outbox, audit, refunds);
    const decision = {
      action: 'refund', resolutionId, orderId: payment.orderId, paymentId: payment.id,
      customerUserId: customer, workerUserId: worker, adminUserId: admin,
      refundAmountVnd: '100', resolutionNote: 'Hoàn toàn bộ sau khiếu nại',
    };
    await paymentDb.client.$transaction((tx) => service.recordDecision(decision, tx));
    const reserved = await paymentDb.client.refund.findUniqueOrThrow({ where: { disputeResolutionId: resolutionId } });
    expect(reserved.status).toBe('needs_review');
    const before = (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })).balance;

    await refunds.execute(reserved.id);

    expect((await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })).balance).toBe(before + 100n);
    expect((await paymentDb.client.refund.findUniqueOrThrow({ where: { id: reserved.id } })).status).toBe('completed');
    expect(await paymentDb.client.outboxEvent.count({ where: {
      eventType: 'payment.dispute.refund.completed',
      payload: { path: ['resolutionId'], equals: resolutionId },
    } })).toBe(1);
    await paymentDb.client.$transaction((tx) => service.recordDecision(decision, tx));
    expect(await paymentDb.client.refund.count({ where: { disputeResolutionId: resolutionId } })).toBe(1);
  });

  it('recovers a lost response after Wallet commit without crediting a second time', async () => {
    const payment = await settled('point');
    class LostResponseClient extends WalletClient {
      override async refundCredit(
        ...args: Parameters<WalletClient['refundCredit']>
      ) {
        const result = await super.refundCredit(...args);
        return result.outcome === 'ok'
          ? {
              outcome: 'unknown' as const,
              message: 'Injected lost response after commit',
            }
          : result;
      }
    }
    const service = new RefundsService(
      paymentDb,
      new AdminAuditService(paymentDb),
      new LostResponseClient(walletConfig),
      new PaymentOutboxService(paymentDb),
    );
    const refund = await service.create(customer, payment.id, {
      amount: '100',
      reason: 'Timeout regression',
      idempotencyKey: randomUUID(),
    });
    const before = (
      await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })
    ).balance;
    expect(
      (
        await service.decide(admin, refund.id, {
          approve: true,
          reason: 'Reviewed',
        })
      ).status,
    ).toBe('needs_review');
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } }))
        .balance,
    ).toBe(before + 100n);
    await service.execute(refund.id);
    expect(
      (
        await paymentDb.client.refund.findUniqueOrThrow({
          where: { id: refund.id },
        })
      ).status,
    ).toBe('completed');
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } }))
        .balance,
    ).toBe(before + 100n);
    expect(
      await walletDb.walletTransfer.count({
        where: { operationId: `${payment.id}:refund:${refund.id}` },
      }),
    ).toBe(1);
  });
  it.each(['point', 'cash'] as const)(
    '%s partial, full and replay preserve balances and emit once',
    async (method) => {
      const payment = await settled(method);
      const before = (
        await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })
      ).balance;
      const totalBefore = (
        await walletDb.wallet.aggregate({ _sum: { balance: true } })
      )._sum.balance;
      for (const amount of ['40', '60']) {
        const refund = await refunds.create(customer, payment.id, {
          amount,
          reason: 'Refund evidence',
          idempotencyKey: randomUUID(),
        });
        const decision = { approve: true, reason: 'Approved evidence' };
        expect((await refunds.decide(admin, refund.id, decision)).status).toBe(
          'completed',
        );
        expect((await refunds.decide(admin, refund.id, decision)).status).toBe(
          'completed',
        );
        expect(
          await paymentDb.client.outboxEvent.count({
            where: { aggregateId: refund.id, eventType: 'payment.refunded' },
          }),
        ).toBe(1);
        expect(
          (
            await paymentDb.client.payment.findUniqueOrThrow({
              where: { id: payment.id },
            })
          ).status,
        ).toBe(amount === '40' ? 'partially_refunded' : 'refunded');
      }
      expect(
        (
          await walletDb.wallet.findUniqueOrThrow({
            where: { userId: customer },
          })
        ).balance,
      ).toBe(before + 100n);
      expect(
        (await walletDb.wallet.aggregate({ _sum: { balance: true } }))._sum
          .balance,
      ).toBe(totalBefore);
    },
  );

  it('insufficient Cash funding stays needs_review, then resumes with the original operation', async () => {
    const payment = await settled('cash');
    await walletDb.wallet.update({
      where: { id: platformId },
      data: { balance: 0n },
    });
    const refund = await refunds.create(customer, payment.id, {
      amount: '100',
      reason: 'Dispute',
      idempotencyKey: randomUUID(),
    });
    const before = (
      await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } })
    ).balance;
    expect(
      (
        await refunds.decide(admin, refund.id, {
          approve: true,
          reason: 'Reviewed',
        })
      ).status,
    ).toBe('needs_review');
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } }))
        .balance,
    ).toBe(before);
    // Test fixture only: fund the test treasury before retry.
    await walletDb.wallet.update({
      where: { id: platformId },
      data: { balance: 100n },
    });
    await refunds.execute(refund.id);
    await refunds.execute(refund.id);
    expect(
      (
        await paymentDb.client.refund.findUniqueOrThrow({
          where: { id: refund.id },
        })
      ).status,
    ).toBe('completed');
    expect(
      (await walletDb.wallet.findUniqueOrThrow({ where: { userId: customer } }))
        .balance,
    ).toBe(before + 100n);
  });
});
