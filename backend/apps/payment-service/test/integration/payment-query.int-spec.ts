import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JWT_AUDIENCE, JWT_ISSUER } from '@app/auth';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentQueryModule } from '../../src/payment-query/payment-query.module.js';

const customerId = randomUUID();
const workerId = randomUUID();
const otherId = randomUUID();
const ruleId = randomUUID();
const paymentId = randomUUID();
const orderId = randomUUID();
const attemptId = randomUUID();
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwt = new JwtService();
let app: INestApplication;
let db: Client;
const originalPublicKey = process.env.JWT_PUBLIC_KEY;
const originalDatabaseUrl = process.env.DATABASE_URL_PAYMENT;
let dbConnected = false;

function token(userId: string): string {
  return jwt.sign(
    { sub: randomUUID(), userId, sid: randomUUID(), roles: [], permissions: [], tokenType: 'access' },
    { privateKey, algorithm: 'RS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  );
}

beforeAll(async () => {
  const rawUrl = process.env.PAYMENT_TEST_DATABASE_URL;
  if (!rawUrl) throw new Error('PAYMENT_TEST_DATABASE_URL is required');
  const url = new URL(rawUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/handygo_hg51_payment_test') {
    throw new Error('Payment HTTP tests require the isolated local handygo_hg51_payment_test database');
  }
  process.env.DATABASE_URL_PAYMENT = rawUrl;
  url.searchParams.delete('schema');
  db = new Client({ connectionString: url.toString() });
  await db.connect();
  dbConnected = true;
  await db.query(
    `INSERT INTO payment_service.commission_rules (id, rate_percent, effective_from, is_active, created_by_user_id)
     VALUES ($1, 5, now(), false, $2)`,
    [ruleId, randomUUID()],
  );
  await db.query(
    `INSERT INTO payment_service.payments
     (id, order_id, customer_user_id, worker_user_id, amount, commission_rule_id,
      commission_rate_percent, platform_fee, worker_earning, updated_at)
     VALUES ($1, $2, $3, $4, 9007199254740993, $5, 5, 450359962737050, 8556839292003943, now())`,
    [paymentId, orderId, customerId, workerId, ruleId],
  );
  await db.query(
    `INSERT INTO payment_service.payment_attempts
     (id, payment_id, attempt_no, method, provider, provider_reference, failure_reason)
     VALUES ($1, $2, 1, 'point', 'wallet_internal', 'sensitive-reference', 'sensitive-provider-detail')`,
    [attemptId, paymentId],
  );
  process.env.JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const module = await Test.createTestingModule({ imports: [PaymentQueryModule] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
});

afterAll(async () => {
  try {
    if (app) await app.close();
    if (dbConnected) {
      try {
        await db.query('DELETE FROM payment_service.payment_attempts WHERE id = $1', [attemptId]);
        await db.query('DELETE FROM payment_service.payments WHERE id = $1', [paymentId]);
        await db.query('DELETE FROM payment_service.commission_rules WHERE id = $1', [ruleId]);
      } finally {
        await db.end();
      }
    }
  } finally {
    if (originalPublicKey === undefined) delete process.env.JWT_PUBLIC_KEY;
    else process.env.JWT_PUBLIC_KEY = originalPublicKey;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL_PAYMENT;
    else process.env.DATABASE_URL_PAYMENT = originalDatabaseUrl;
  }
});

describe('Payment query HTTP', () => {
  it('requires a valid access token', async () => {
    await request(app.getHttpServer()).get(`/api/v1/payments/${paymentId}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/payments/${paymentId}`).set('Authorization', 'Bearer invalid').expect(401);
  });

  it('allows the customer and worker and serializes BIGINT precisely', async () => {
    for (const userId of [customerId, workerId]) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${token(userId)}`)
        .expect(200);
      expect(response.body.data).toMatchObject({
        id: paymentId,
        amount: '9007199254740993',
        platformFee: '450359962737050',
        workerEarning: '8556839292003943',
      });
    }
  });

  it('does not disclose a payment or attempts to an unrelated user', async () => {
    for (const route of [`/api/v1/payments/${paymentId}`, `/api/v1/payments/order/${orderId}`, `/api/v1/payments/${paymentId}/attempts`]) {
      await request(app.getHttpServer()).get(route).set('Authorization', `Bearer ${token(otherId)}`).expect(404);
    }
  });

  it('lists only the caller’s payments and validates pagination and filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/payments/me?status=pending&limit=1')
      .set('Authorization', `Bearer ${token(customerId)}`)
      .expect(200);
    expect(response.body.data).toMatchObject({ total: 1, page: 1, limit: 1, items: [{ id: paymentId }] });
    const unrelated = await request(app.getHttpServer())
      .get('/api/v1/payments/me')
      .set('Authorization', `Bearer ${token(otherId)}`)
      .expect(200);
    expect(unrelated.body.data.items).toEqual([]);
    await request(app.getHttpServer()).get('/api/v1/payments/me?limit=101').set('Authorization', `Bearer ${token(customerId)}`).expect(400);
    await request(app.getHttpServer()).get('/api/v1/payments/me?status=unknown').set('Authorization', `Bearer ${token(customerId)}`).expect(400);
  });

  it('returns attempts without provider reference or failure details', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentId}/attempts`)
      .set('Authorization', `Bearer ${token(customerId)}`)
      .expect(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ id: attemptId, attemptNo: 1, method: 'point' });
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
  });

  it('finds a payment by order for the worker and rejects invalid UUIDs', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/payments/order/${orderId}`)
      .set('Authorization', `Bearer ${token(workerId)}`)
      .expect(200);
    expect(response.body.data.id).toBe(paymentId);
    await request(app.getHttpServer()).get('/api/v1/payments/not-a-uuid').set('Authorization', `Bearer ${token(customerId)}`).expect(400);
  });
});
