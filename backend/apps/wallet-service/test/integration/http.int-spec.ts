import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@app/config';
import { BigIntSerializerInterceptor } from '../../src/common/interceptors/bigint-serializer.interceptor.js';
import { WalletPrismaService } from '../../src/wallet-ledger/wallet-prisma.service.js';
import { WalletLedgerService } from '../../src/wallet-ledger/wallet-ledger.service.js';
import { RefundAdjustmentController } from '../../src/refund-adjustment/refund-adjustment.controller.js';
import { RefundAdjustmentService } from '../../src/refund-adjustment/refund-adjustment.service.js';
import { WithdrawalController } from '../../src/withdrawal/withdrawal.controller.js';
import { WithdrawalService } from '../../src/withdrawal/withdrawal.service.js';
import { BankAccountVerifier } from '../../src/withdrawal/bank-account-verifier/bank-account-verifier.port.js';
import { resetDb } from './helpers/harness.js';

const SECRET = 'test-internal-secret-at-least-32-characters-long';
let app: INestApplication;
let prisma: WalletPrismaService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [RefundAdjustmentController, WithdrawalController],
    providers: [
      WalletPrismaService,
      WalletLedgerService,
      RefundAdjustmentService,
      WithdrawalService,
      { provide: BankAccountVerifier, useValue: { verify: async () => true } },
      { provide: ConfigService, useValue: { internalServiceSecret: SECRET } },
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  await app.init();
  prisma = app.get(WalletPrismaService);
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb();
  await prisma.wallet.create({ data: { systemKey: 'PLATFORM_FEES', balance: 1000n } });
});

const adminHeaders = (actor = randomUUID()) => ({
  'x-internal-secret': SECRET,
  'x-user-roles': 'admin',
  'x-user-id': actor,
});

describe('HTTP: BigInt serialization (F10) & adjustment authz', () => {
  it('adjustment trả totalAmount dạng string, không lỗi BigInt', async () => {
    const userId = randomUUID();
    await prisma.wallet.create({ data: { userId } });
    const res = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set(adminHeaders())
      .send({ direction: 'credit', amount: '25', reason: 'goodwill credit', idempotencyKey: 'http-1' });
    expect(res.status).toBe(201);
    expect(res.body.data.totalAmount).toBe('25');
  });

  it('thiếu/sai x-internal-secret → 403', async () => {
    const userId = randomUUID();
    const body = { direction: 'credit', amount: '1', reason: 'goodwill credit', idempotencyKey: 'http-2' };
    const noSecret = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set({ 'x-user-roles': 'admin', 'x-user-id': randomUUID() })
      .send(body);
    const badSecret = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set({ ...adminHeaders(), 'x-internal-secret': 'x'.repeat(SECRET.length) })
      .send(body);
    expect(noSecret.status).toBe(403);
    expect(badSecret.status).toBe(403);
  });

  it('không có role admin → 403 và không tạo audit', async () => {
    const userId = randomUUID();
    await prisma.wallet.create({ data: { userId } });
    const res = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set({ ...adminHeaders(), 'x-user-roles': 'customer' })
      .send({ direction: 'credit', amount: '1', reason: 'goodwill credit', idempotencyKey: 'http-3' });
    expect(res.status).toBe(403);
    expect(await prisma.walletAuditLog.count()).toBe(0);
  });

  it('actor lấy từ x-user-id (do Gateway inject); thiếu hoặc không phải UUID → 403', async () => {
    const userId = randomUUID();
    await prisma.wallet.create({ data: { userId } });
    const body = { direction: 'credit', amount: '1', reason: 'goodwill credit', idempotencyKey: 'http-4' };
    const missing = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set({ 'x-internal-secret': SECRET, 'x-user-roles': 'admin' })
      .send(body);
    const bogus = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set(adminHeaders('not-a-uuid' as ReturnType<typeof randomUUID>))
      .send(body);
    const actor = randomUUID();
    const ok = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set(adminHeaders(actor))
      .send(body);
    expect(missing.status).toBe(403);
    expect(bogus.status).toBe(403);
    expect(ok.status).toBe(201);
    expect((await prisma.walletAuditLog.findFirstOrThrow()).actorId).toBe(actor);
  });

  it('header x-actor-id do client gửi không còn được tin', async () => {
    const userId = randomUUID();
    await prisma.wallet.create({ data: { userId } });
    const res = await request(app.getHttpServer())
      .post(`/internal/wallets/${userId}/adjustments`)
      .set({ 'x-internal-secret': SECRET, 'x-user-roles': 'admin', 'x-actor-id': randomUUID() })
      .send({ direction: 'credit', amount: '1', reason: 'goodwill credit', idempotencyKey: 'http-5' });
    expect(res.status).toBe(403);
  });
});

describe('HTTP: withdrawal endpoints', () => {
  it('tạo withdrawal trả amount dạng string và yêu cầu x-user-id + secret', async () => {
    const userId = randomUUID();
    await prisma.wallet.create({ data: { userId, balance: 100n } });
    const body = { bankAccountId: randomUUID(), amount: '40', idempotencyKey: 'w-http-1' };
    const noSecret = await request(app.getHttpServer())
      .post('/wallets/me/withdrawals').set('x-user-id', userId).send(body);
    const noUser = await request(app.getHttpServer())
      .post('/wallets/me/withdrawals').set('x-internal-secret', SECRET).send(body);
    const ok = await request(app.getHttpServer())
      .post('/wallets/me/withdrawals')
      .set({ 'x-internal-secret': SECRET, 'x-user-id': userId })
      .send(body);
    expect(noSecret.status).toBe(403);
    expect(noUser.status).toBe(403);
    expect(ok.status).toBe(201);
    expect(ok.body.data.amount).toBe('40');
  });

  it('user khác không đọc/hủy được withdrawal của người khác', async () => {
    const owner = randomUUID();
    await prisma.wallet.create({ data: { userId: owner, balance: 100n } });
    const created = await request(app.getHttpServer())
      .post('/wallets/me/withdrawals')
      .set({ 'x-internal-secret': SECRET, 'x-user-id': owner })
      .send({ bankAccountId: randomUUID(), amount: '10', idempotencyKey: 'w-http-2' });
    const id = created.body.data.id as string;
    const other = { 'x-internal-secret': SECRET, 'x-user-id': randomUUID() };
    expect((await request(app.getHttpServer()).get(`/wallets/me/withdrawals/${id}`).set(other)).status).toBe(404);
    expect((await request(app.getHttpServer()).post(`/wallets/me/withdrawals/${id}/cancel`).set(other)).status).toBe(404);
  });
});
