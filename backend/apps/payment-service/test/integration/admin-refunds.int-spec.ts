import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  JwtAuthGuard,
  TokenVerifierService,
} from '@app/auth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCommission } from '../../prisma/seed-commission.js';
import { AdminAuditService } from '../../src/common/audit/admin-audit.service.js';
import { PaymentPrismaService } from '../../src/common/database/payment-prisma.service.js';
import { PAYMENT_PERMISSIONS as P } from '../../src/common/auth/admin-access.js';
import { CommissionRulesAdminService } from '../../src/commission-rules/commission-rules-admin.service.js';
import { CommissionRulesAdminController } from '../../src/commission-rules/commission-rules-admin.controller.js';
import { CommissionRuleService } from '../../src/commission-rules/commission-rule.service.js';
import { RefundsService } from '../../src/refunds/refunds.service.js';
import { RefundsController } from '../../src/refunds/refunds.controller.js';
import { PaymentOperationsService } from '../../src/reconciliation/payment-operations.service.js';
import { PaymentOperationsController } from '../../src/reconciliation/payment-operations.controller.js';
import { PaymentReconcilerService } from '../../src/reconciliation/payment-reconciler.service.js';
import { PaymentQueryController } from '../../src/payment-query/payment-query.controller.js';
import { PaymentQueryService } from '../../src/payment-query/payment-query.service.js';

// Test identities only, confined to the isolated throwaway database. No production Admin is fabricated.
const customer = randomUUID(),
  admin = randomUUID(),
  worker = randomUUID();
const eventId = `test-dead:${randomUUID()}`;
const paymentIds: string[] = [],
  ruleIds: string[] = [];
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwt = new JwtService();
const original = {
  database: process.env.DATABASE_URL_PAYMENT,
  key: process.env.JWT_PUBLIC_KEY,
};
let database: PaymentPrismaService,
  audit: AdminAuditService,
  refunds: RefundsService,
  rules: CommissionRulesAdminService,
  operations: PaymentOperationsService;
let app: INestApplication;
let seedEnv: NodeJS.ProcessEnv;
const runOnce = vi.fn().mockResolvedValue({ pointAttempts: 0 });
function token(id: string, roles: string[] = [], permissions: string[] = []) {
  return jwt.sign(
    {
      sub: randomUUID(),
      userId: id,
      sid: randomUUID(),
      roles,
      permissions,
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
function authorized(method: 'get' | 'post', path: string, permission: string) {
  return request(app.getHttpServer())
    [method](`/payments${path}`)
    .set('Authorization', `Bearer ${token(admin, ['Admin'], [permission])}`);
}
async function payment(
  method: 'cash' | 'point' = 'point',
  status: 'succeeded' | 'pending' = 'succeeded',
) {
  const row = await database.client.payment.create({
    data: {
      orderId: randomUUID(),
      customerUserId: customer,
      workerUserId: worker,
      amount: 100n,
      commissionRuleId: ruleIds[0],
      commissionRatePercent: '10.00',
      platformFee: 10n,
      workerEarning: 90n,
      method,
      status,
    },
  });
  paymentIds.push(row.id);
  return row;
}
const dto = (amount: string, key = randomUUID()) => ({
  amount,
  reason: 'Test dispute evidence',
  idempotencyKey: key,
});

beforeAll(async () => {
  const raw = process.env.PAYMENT_TEST_DATABASE_URL;
  if (!raw) throw new Error('PAYMENT_TEST_DATABASE_URL is required');
  const url = new URL(raw);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/handygo_hg51_payment_test'
  )
    throw new Error('Isolated local Payment test database required');
  process.env.DATABASE_URL_PAYMENT = raw;
  process.env.JWT_PUBLIC_KEY = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
  database = new PaymentPrismaService();
  audit = new AdminAuditService(database);
  refunds = new RefundsService(database, audit);
  rules = new CommissionRulesAdminService(database, audit);
  operations = new PaymentOperationsService(database, audit);
  seedEnv = {
    DATABASE_URL_PAYMENT: raw,
    COMMISSION_SEED_ACTOR_ID: admin,
    COMMISSION_SEED_EFFECTIVE_FROM: '2020-01-01T00:00:00Z',
  };
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    controllers: [
      RefundsController,
      CommissionRulesAdminController,
      PaymentQueryController,
      PaymentOperationsController,
    ],
    providers: [
      JwtAuthGuard,
      TokenVerifierService,
      { provide: RefundsService, useValue: refunds },
      { provide: CommissionRulesAdminService, useValue: rules },
      {
        provide: PaymentQueryService,
        useValue: new PaymentQueryService(database),
      },
      { provide: PaymentOperationsService, useValue: operations },
      { provide: PaymentReconcilerService, useValue: { runOnce } },
      { provide: AdminAuditService, useValue: audit },
    ],
  }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
});

afterAll(async () => {
  if (app) await app.close();
  if (database) {
    await database.client.refund.deleteMany({
      where: { paymentId: { in: paymentIds } },
    });
    await database.client.payment.deleteMany({
      where: { id: { in: paymentIds } },
    });
    await database.client.commissionRule.deleteMany({
      where: { createdByUserId: admin },
    });
    await database.client.adminAuditLog.deleteMany({
      where: { actorUserId: { in: [admin, customer] } },
    });
    await database.client.failedInboundEvent.deleteMany({ where: { eventId } });
    await database.client.dailyReconciliationReport.deleteMany({
      where: { reportDate: new Date('2001-01-02T00:00:00Z') },
    });
    await database.onModuleDestroy();
  }
  for (const [key, value] of [
    ['DATABASE_URL_PAYMENT', original.database],
    ['JWT_PUBLIC_KEY', original.key],
  ]) {
    if (value === undefined) delete process.env[key!];
    else process.env[key!] = value;
  }
});

describe('Controlled commission seed and versioning (PostgreSQL)', () => {
  it('serializes concurrent bootstrap runs and writes exactly one rule/audit', async () => {
    const results = await Promise.all([
      seedCommission(seedEnv),
      seedCommission(seedEnv),
    ]);
    ruleIds.push(results[0].id);
    expect(results[1].id).toBe(results[0].id);
    expect(results.filter((row) => row.created)).toHaveLength(1);
    expect(
      await database.client.adminAuditLog.count({
        where: { action: 'commission_rule.seeded', actorUserId: admin },
      }),
    ).toBe(1);
    expect((await seedCommission(seedEnv)).created).toBe(false);
  });
  it('refuses a different actor/date without altering the seed', async () => {
    await expect(
      seedCommission({ ...seedEnv, COMMISSION_SEED_ACTOR_ID: randomUUID() }),
    ).rejects.toThrow(/conflicts/);
    await expect(
      seedCommission({
        ...seedEnv,
        COMMISSION_SEED_EFFECTIVE_FROM: '2021-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(/already exist/);
  });
  it('keeps pre-rollout orders closed instead of backdating the rule', async () => {
    await expect(
      database.client.$transaction((tx) =>
        new CommissionRuleService().snapshotFor(
          tx,
          100n,
          new Date('2019-12-31T23:59:59Z'),
        ),
      ),
    ).rejects.toThrow();
  });
  it('versions adjacent rules, preserves existing snapshots and rejects a concurrent duplicate', async () => {
    const settled = await payment();
    const effectiveFrom = '2090-01-01T00:00:00Z';
    const results = await Promise.allSettled([
      rules.create(admin, { ratePercent: '0', effectiveFrom }),
      rules.create(admin, { ratePercent: '30.00', effectiveFrom }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await database.client.commissionRule.findUniqueOrThrow({
          where: { id: ruleIds[0] },
        })
      ).effectiveTo?.toISOString(),
    ).toBe('2090-01-01T00:00:00.000Z');
    expect(
      (
        await database.client.payment.findUniqueOrThrow({
          where: { id: settled.id },
        })
      ).commissionRatePercent.toFixed(2),
    ).toBe('10.00');
    await expect(
      rules.create(admin, {
        ratePercent: '30.01',
        effectiveFrom: '2091-01-01T00:00:00Z',
      }),
    ).rejects.toThrow();
    // Re-running the original seed remains a no-op even after its interval was legitimately closed.
    expect((await seedCommission(seedEnv)).created).toBe(false);
  });
});

describe('Refund reservations and Admin decisions (PostgreSQL)', () => {
  it.each(['cash', 'point'] as const)(
    'reserves %s refunds and approval stays needs_review without credit or success event',
    async (method) => {
      const paid = await payment(method);
      const refund = await refunds.create(customer, paid.id, dto('40'));
      const approved = await refunds.decide(admin, refund.id, {
        approve: true,
        reason: 'Evidence reviewed',
      });
      expect(approved).toMatchObject({
        status: 'needs_review',
        destination: 'point',
        amount: '40',
        approvedByUserId: admin,
      });
      expect(
        (
          await database.client.payment.findUniqueOrThrow({
            where: { id: paid.id },
          })
        ).status,
      ).toBe('succeeded');
      expect(
        await database.client.outboxEvent.count({
          where: { aggregateId: paid.id },
        }),
      ).toBe(0);
      const row = await database.client.refund.findUniqueOrThrow({
        where: { id: refund.id },
      });
      expect(row.walletTransferId).toBeNull();
      expect(row.refundedAt).toBeNull();
      expect(
        await database.client.adminAuditLog.count({
          where: { entityId: refund.id, action: 'refund.approved' },
        }),
      ).toBe(1);
      await refunds.decide(admin, refund.id, {
        approve: true,
        reason: 'Evidence reviewed',
      });
      expect(
        await database.client.adminAuditLog.count({
          where: { entityId: refund.id, action: 'refund.approved' },
        }),
      ).toBe(1);
    },
  );
  it('prevents concurrent partial requests from exceeding the original payment', async () => {
    const paid = await payment();
    const results = await Promise.allSettled([
      refunds.create(customer, paid.id, dto('60')),
      refunds.create(customer, paid.id, dto('60')),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await database.client.refund.aggregate({
          where: { paymentId: paid.id },
          _sum: { amountVnd: true },
        })
      )._sum.amountVnd,
    ).toBe(60n);
  });
  it('replays identical requests once and rejects a changed payload', async () => {
    const paid = await payment();
    const input = dto('50');
    const [a, b] = await Promise.all([
      refunds.create(customer, paid.id, input),
      refunds.create(customer, paid.id, input),
    ]);
    expect(a.id).toBe(b.id);
    await expect(
      refunds.create(customer, paid.id, { ...input, amount: '51' }),
    ).rejects.toThrow(/Idempotency/);
  });
  it('releases the reservation on rejection and serializes conflicting decisions', async () => {
    const paid = await payment();
    const refund = await refunds.create(customer, paid.id, dto('100'));
    const results = await Promise.allSettled([
      refunds.decide(admin, refund.id, { approve: false, reason: 'Reject' }),
      refunds.decide(admin, refund.id, { approve: true, reason: 'Approve' }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    const row = await database.client.refund.findUniqueOrThrow({
      where: { id: refund.id },
    });
    expect(['cancelled', 'needs_review']).toContain(row.status);
    const anotherPayment = await payment();
    const rejected = await refunds.create(
      customer,
      anotherPayment.id,
      dto('100'),
    );
    await refunds.decide(admin, rejected.id, {
      approve: false,
      reason: 'Reject',
    });
    expect(
      (await refunds.create(customer, anotherPayment.id, dto('100'))).status,
    ).toBe('pending');
  });
  it('rejects unrelated requesters, unsettled payments and self approval', async () => {
    const paid = await payment(),
      pending = await payment('point', 'pending');
    await expect(refunds.create(worker, paid.id, dto('1'))).rejects.toThrow(
      /not found/,
    );
    await expect(
      refunds.create(customer, pending.id, dto('1')),
    ).rejects.toThrow(/settled/);
    const refund = await refunds.create(customer, paid.id, dto('1'));
    await expect(
      refunds.decide(customer, refund.id, { approve: true, reason: 'Self' }),
    ).rejects.toThrow(/own refund/);
  });

  it('rolls the decision back when audit persistence fails', async () => {
    const paid = await payment();
    const refund = await refunds.create(customer, paid.id, dto('20'));
    const unavailableAudit = {
      record: vi.fn().mockRejectedValue(new Error('Audit unavailable')),
    };
    const service = new RefundsService(database, unavailableAudit as never);
    await expect(
      service.decide(admin, refund.id, { approve: true, reason: 'Reviewed' }),
    ).rejects.toThrow(/Audit unavailable/);
    expect(
      await database.client.refund.findUniqueOrThrow({
        where: { id: refund.id },
      }),
    ).toMatchObject({
      status: 'pending',
      approvedByUserId: null,
      approvedAt: null,
    });
  });
});

describe('Admin HTTP authorization, validation and operations', () => {
  it('requires JWT, Admin role and each permission', async () => {
    const paid = await payment();
    const routes = [
      '/admin/records',
      '/admin/commission-rules',
      `/admin/${paid.id}/refunds`,
      '/admin/operations/dead-letters',
      '/admin/operations/reports',
    ];
    for (const path of routes) {
      await request(app.getHttpServer()).get(`/payments${path}`).expect(401);
      await request(app.getHttpServer())
        .get(`/payments${path}`)
        .set('Authorization', `Bearer ${token(admin, ['Admin'])}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/payments${path}`)
        .set(
          'Authorization',
          `Bearer ${token(customer, ['Customer'], Object.values(P))}`,
        )
        .expect(403);
    }
    const response = await authorized(
      'get',
      `/admin/records/${paid.id}`,
      P.readAll,
    ).expect(200);
    expect(response.body.data.amount).toBe('100');
    expect(response.body.data).not.toHaveProperty('failureReason');
  });
  it('validates money/rates, timestamps and approval DTOs at the HTTP boundary', async () => {
    for (const ratePercent of ['30.01', '100', '1.001']) {
      await authorized('post', '/admin/commission-rules', P.commissionManage)
        .send({ ratePercent, effectiveFrom: '2095-01-01T00:00:00Z' })
        .expect(400);
    }
    await authorized('post', '/admin/commission-rules', P.commissionManage)
      .send({ ratePercent: '10', effectiveFrom: '2095-01-01T00:00:00' })
      .expect(400);
    const paid = await payment();
    for (const amount of ['1.1', '0', '9223372036854775808']) {
      await request(app.getHttpServer())
        .post(`/payments/${paid.id}/refunds`)
        .set('Authorization', `Bearer ${token(customer)}`)
        .send(dto(amount))
        .expect(400);
    }
    const refund = await refunds.create(customer, paid.id, dto('1'));
    await authorized(
      'post',
      `/admin/refunds/${refund.id}/decision`,
      P.refundApprove,
    )
      .send({ approve: 'true', reason: 'Evidence' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/payments/admin/refunds/${refund.id}/decision`)
      .set('Authorization', `Bearer ${token(customer)}`)
      .send({ approve: true, reason: 'Evidence' })
      .expect(403);
    await authorized(
      'post',
      `/admin/refunds/${refund.id}/decision`,
      P.refundApprove,
    )
      .send({ approve: true, reason: 'Evidence' })
      .expect(201);
  });
  it('replays dead letters once with unchanged ID/payload and audit', async () => {
    const payload = { eventId, data: { sensitive: 'hidden-bank-data' } };
    await database.client.failedInboundEvent.create({
      data: {
        eventId,
        eventType: 'order.created',
        payload,
        status: 'dead',
        attempts: 8,
      },
    });
    const list = await authorized(
      'get',
      '/admin/operations/dead-letters',
      P.dlqReplay,
    ).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('hidden-bank-data');
    await authorized('post', '/admin/operations/replay', P.dlqReplay)
      .send({ eventId, reason: 'Dependency repaired' })
      .expect(201);
    await authorized('post', '/admin/operations/replay', P.dlqReplay)
      .send({ eventId, reason: 'Again' })
      .expect(409);
    expect(
      await database.client.failedInboundEvent.findUniqueOrThrow({
        where: { eventId },
      }),
    ).toMatchObject({ eventId, payload, status: 'retrying', attempts: 0 });
    expect(
      await database.client.adminAuditLog.count({
        where: { entityId: eventId, action: 'inbound.replay_scheduled' },
      }),
    ).toBe(1);
  });
  it('records a local report once per Vietnam day and audits manual reconciliation', async () => {
    const [a, b] = await Promise.all([
      operations.dailyReport(new Date('2001-01-01T18:00:00Z')),
      operations.dailyReport(new Date('2001-01-01T18:00:00Z')),
    ]);
    expect(a.reportDate.toISOString()).toBe('2001-01-02T00:00:00.000Z');
    expect(b.reportDate).toEqual(a.reportDate);
    expect(a.summary).toMatchObject({ walletLedgerCompared: false });
    await authorized('post', '/admin/operations/reconcile', P.reconcile)
      .send({ reason: 'Investigate stuck attempts' })
      .expect(201);
    expect(runOnce).toHaveBeenCalledOnce();
    expect(
      await database.client.adminAuditLog.count({
        where: { actorUserId: admin, action: 'reconciliation.finished' },
      }),
    ).toBe(1);
  });
});
