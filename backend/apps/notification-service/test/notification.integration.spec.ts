import 'reflect-metadata';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { Test } from '@nestjs/testing';
import {
  type INestApplication,
  ValidationPipe,
  RequestMethod,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { HttpExceptionFilter, AppException, ERROR_CODES } from '@app/common';
import { ConfigService } from '@app/config';
import { TokenVerifierService } from '@app/auth';
import { NotificationPrismaService } from '../src/common/notification-prisma.service.js';
import { GatewayAuthMiddleware } from '../../api-gateway/src/auth/gateway-auth.middleware.js';
import { notificationFixture } from './fixtures.js';

const databaseUrl = process.env.NOTIFICATION_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)(
  'Notification Phase 1 — HTTP and real PostgreSQL',
  () => {
    let app: INestApplication;
    let db: NotificationPrismaService;
    let admin: Pool;
    const schema = `notification_test_${randomUUID().replaceAll('-', '')}`;
    const owner = randomUUID();
    const other = randomUUID();
    const secret = 'notification-integration-secret';
    const base = '/api/v1/notifications';
    let gateway: GatewayAuthMiddleware;
    let accessToken: string;
    let refreshToken: string;
    const headers = (userId: string = owner) => ({
      'x-internal-secret': secret,
      'x-user-id': userId,
    });

    beforeAll(async () => {
      const url = new URL(databaseUrl!);
      if (!url.pathname.slice(1).startsWith('notification_test'))
        throw new Error(
          'Tests require a dedicated database named notification_test*',
        );
      admin = new Pool({ connectionString: url.toString() });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const migration = readFileSync(
        new URL(
          '../prisma/migrations/20261020000000_notification_phase1/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const client = await admin.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(migration.replaceAll('"public".', `"${schema}".`));
      } finally {
        client.release();
      }
      url.searchParams.set('schema', schema);
      vi.stubEnv('DATABASE_URL_NOTIFICATION', url.toString());
      vi.stubEnv('NOTIFICATION_EVENTS_ENABLED', 'false');
      vi.stubEnv('INTERNAL_SERVICE_SECRET', secret);
      vi.stubEnv('LOG_LEVEL', 'silent');
      const { NotificationServiceModule } =
        await import('../src/notification-service.module.js');
      const module = await Test.createTestingModule({
        imports: [NotificationServiceModule],
      }).compile();
      app = module.createNestApplication({ logger: false });
      app.setGlobalPrefix('api/v1', {
        exclude: [{ path: 'health', method: RequestMethod.GET }],
      });
      app.useGlobalFilters(new HttpExceptionFilter());
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          exceptionFactory: (errors) =>
            new AppException(
              400,
              ERROR_CODES.VALIDATION_ERROR,
              'Invalid input',
              {
                fieldErrors: Object.fromEntries(
                  errors.map((error) => [
                    error.property,
                    Object.values(error.constraints ?? {}),
                  ]),
                ),
              },
            ),
        }),
      );

      // Exercise the real gateway middleware and real RS256 verification in-process.
      // No upstream service is called; direct requests still test the downstream guard.
      const keys = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      vi.stubEnv('JWT_PUBLIC_KEY', keys.publicKey);
      const verifier = new TokenVerifierService(new JwtService());
      gateway = new GatewayAuthMiddleware(verifier, {
        internalServiceSecret: secret,
      } as ConfigService);
      const jwt = new JwtService();
      const payload = {
        sub: randomUUID(),
        userId: owner,
        sid: randomUUID(),
        roles: ['Customer'],
        permissions: [],
      };
      const signing = {
        privateKey: keys.privateKey,
        algorithm: 'RS256' as const,
        expiresIn: 3600,
        issuer: 'handy-go-auth',
        audience: 'handy-go-api',
      };
      accessToken = jwt.sign({ ...payload, tokenType: 'access' }, signing);
      refreshToken = jwt.sign({ ...payload, tokenType: 'refresh' }, signing);
      app.use(
        (
          req: import('express').Request,
          res: import('express').Response,
          next: import('express').NextFunction,
        ) => {
          if (req.headers['x-test-through-gateway'])
            void gateway.use(req, res, next);
          else next();
        },
      );
      await app.init();
      db = app.get(NotificationPrismaService);
    }, 30000);

    beforeEach(async () => {
      if (!db) return;
      await db.notificationDeliveryAttempt.deleteMany();
      await db.notification.deleteMany();
      await db.deviceToken.deleteMany();
      await db.notificationPreference.deleteMany();
    });

    afterAll(async () => {
      await app?.close();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
      vi.unstubAllEnvs();
    });

    it('runs independently and exposes all nine documented operations with response schemas', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      const operations = Object.entries(document.paths)
        .filter(([path]) => path.startsWith(base))
        .flatMap(([, methods]) => Object.values(methods));
      expect(operations).toHaveLength(9);
      for (const operation of operations) {
        expect(operation.security).toEqual([{ bearer: [] }]);
        expect(
          operation.responses['200'].content['application/json'].schema.$ref,
        ).toBeTruthy();
      }
      expect(document.paths[`${base}/send`]).toBeUndefined();
    });

    it.each([
      ['get', ''],
      ['get', '/unread-count'],
      ['get', '/preferences'],
      ['patch', '/preferences'],
      ['post', '/devices'],
      ['delete', `/devices/${randomUUID()}`],
      ['get', `/${randomUUID()}`],
      ['patch', `/${randomUUID()}/read`],
      ['post', '/read-all'],
    ] as const)(
      'protects %s %s from forged identity headers',
      async (method, path) => {
        const result: request.Response = await request(app.getHttpServer())
          [method](`${base}${path}`)
          .set('x-user-id', owner)
          .expect(403);
        expect(result.body).toMatchObject({
          statusCode: 403,
          code: 'FORBIDDEN',
          data: null,
        });
      },
    );

    it('rejects an invalid user ID even with a trusted gateway secret', async () => {
      await request(app.getHttpServer())
        .get(base)
        .set(headers('bad'))
        .expect(401);
    });

    it('verifies access tokens at the gateway and removes spoofed identity', async () => {
      await db.notification.create({ data: notificationFixture(owner) });
      await request(app.getHttpServer())
        .get(base)
        .set('x-test-through-gateway', '1')
        .set(headers())
        .expect(401);
      await request(app.getHttpServer())
        .get(base)
        .set('x-test-through-gateway', '1')
        .set('Authorization', 'Bearer bad')
        .expect(401);
      await request(app.getHttpServer())
        .get(base)
        .set('x-test-through-gateway', '1')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
      const result: request.Response = await request(app.getHttpServer())
        .get(base)
        .set('x-test-through-gateway', '1')
        .set('Authorization', `Bearer ${accessToken}`)
        .set(headers(other))
        .expect(200);
      expect(result.body.data.items).toHaveLength(1);
    });

    it('registers, deduplicates, rotates and reactivates one device without leaking tokens', async () => {
      const create = (pushToken: string) =>
        request(app.getHttpServer())
          .post(`${base}/devices`)
          .set(headers())
          .send({
            platform: 'android',
            deviceId: 'phone-a',
            pushToken,
            userId: other,
          });
      const initial = await create('token-a').expect(200);
      expect(initial.body.data).not.toHaveProperty('pushToken');
      expect(initial.text).not.toContain('token-a');
      expect((await create('token-a').expect(200)).body.data.id).toBe(
        initial.body.data.id,
      );
      expect((await create('token-b').expect(200)).body.data.id).toBe(
        initial.body.data.id,
      );
      await request(app.getHttpServer())
        .post(`${base}/devices`)
        .set(headers())
        .send({
          platform: 'ios',
          deviceId: 'phone-b',
          pushToken: 'second-token',
        })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`${base}/devices/${initial.body.data.id}`)
        .set(headers())
        .expect(200);
      await request(app.getHttpServer())
        .delete(`${base}/devices/${initial.body.data.id}`)
        .set(headers())
        .expect(200);
      expect(
        await db.deviceToken.count({
          where: { userId: owner, isActive: true },
        }),
      ).toBe(1);
      expect((await create('token-c').expect(200)).body.data).toMatchObject({
        id: initial.body.data.id,
        isActive: true,
      });
      expect(await db.deviceToken.count()).toBe(2);
      expect(await db.deviceToken.count({ where: { userId: other } })).toBe(0);
    });

    it('supports token-only idempotency and refuses token theft or installation collisions', async () => {
      const dto = { platform: 'ios', pushToken: 'shared-token' };
      const first = await request(app.getHttpServer())
        .post(`${base}/devices`)
        .set(headers())
        .send(dto)
        .expect(200);
      const duplicate = await request(app.getHttpServer())
        .post(`${base}/devices`)
        .set(headers())
        .send(dto)
        .expect(200);
      expect(duplicate.body.data.id).toBe(first.body.data.id);
      await request(app.getHttpServer())
        .post(`${base}/devices`)
        .set(headers(other))
        .send(dto)
        .expect(409);
      await request(app.getHttpServer())
        .delete(`${base}/devices/${first.body.data.id}`)
        .set(headers(other))
        .expect(404);
      await request(app.getHttpServer())
        .post(`${base}/devices`)
        .set(headers())
        .send({ ...dto, deviceId: 'stable' })
        .expect(200);
      await request(app.getHttpServer())
        .post(`${base}/devices`)
        .set(headers())
        .send({ ...dto, deviceId: 'different' })
        .expect(409);
      expect(await db.deviceToken.count()).toBe(1);
    });

    it('serializes simultaneous duplicate registrations', async () => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(app.getHttpServer())
            .post(`${base}/devices`)
            .set(headers())
            .send({
              platform: 'ios',
              deviceId: 'concurrent',
              pushToken: 'same-token',
            }),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200));
      expect(new Set(responses.map((r) => r.body.data.id)).size).toBe(1);
      expect(await db.deviceToken.count()).toBe(1);
    });

    it('allows only one owner to claim the same token concurrently', async () => {
      const results = await Promise.all(
        [owner, other].map((userId) =>
          request(app.getHttpServer())
            .post(`${base}/devices`)
            .set(headers(userId))
            .send({
              platform: 'android',
              deviceId: 'same-installation',
              pushToken: 'contested-token',
            }),
        ),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      expect(await db.deviceToken.count()).toBe(1);
      expect(
        results.find((result) => result.status === 409)!.text,
      ).not.toContain('contested-token');
    });

    it('enforces database deduplication, foreign keys and the DBML delivery constraints', async () => {
      const notification = await db.notification.create({
        data: notificationFixture(owner),
      });
      await expect(
        db.notification.create({
          data: notificationFixture(owner, {
            dedupeKey: notification.dedupeKey,
          }),
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const device = await db.deviceToken.create({
        data: {
          userId: owner,
          platform: 'ios',
          pushToken: 'constraint-token',
          deviceId: 'constraint-device',
        },
      });
      await expect(
        db.deviceToken.create({
          data: {
            userId: owner,
            platform: 'ios',
            pushToken: 'different-token',
            deviceId: 'constraint-device',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const attempt = {
        notificationId: notification.id,
        deliveryAttemptKey: randomUUID(),
        channel: 'push' as const,
        deviceTokenId: device.id,
      };
      await expect(
        db.notificationDeliveryAttempt.create({
          data: { ...attempt, attemptNo: 0 },
        }),
      ).rejects.toThrow();
      await expect(
        db.notificationDeliveryAttempt.create({
          data: { ...attempt, deviceTokenId: null },
        }),
      ).rejects.toThrow();
      await expect(
        db.notificationDeliveryAttempt.create({
          data: { ...attempt, channel: 'email' },
        }),
      ).rejects.toThrow();
      await expect(
        db.notificationDeliveryAttempt.create({
          data: { ...attempt, notificationId: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      await db.notificationDeliveryAttempt.create({ data: attempt });
      await expect(
        db.deviceToken.delete({ where: { id: device.id } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it.each([
      { platform: 'web', pushToken: 'token' },
      { platform: 'ios', pushToken: '' },
      { platform: 'android', pushToken: 'white space' },
      { platform: 'ios', pushToken: 'x'.repeat(4097) },
      { platform: 'ios', pushToken: 'token', deviceId: null },
      { platform: 'ios', pushToken: 'token', deviceId: ' ' },
    ])('validates registration DTO %#', async (dto) => {
      const result: request.Response = await request(app.getHttpServer())
        .post(`${base}/devices`)
        .set(headers())
        .send(dto)
        .expect(400);
      expect(result.body.code).toBe('VALIDATION_ERROR');
    });

    it('paginates timestamp ties without duplicates and counts/filters only owned notifications', async () => {
      const at = new Date('2026-01-01T00:00:00.123Z');
      const rows = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          db.notification.create({
            data: notificationFixture(owner, {
              createdAt: at,
              readAt: index === 0 ? at : null,
            }),
          }),
        ),
      );
      await db.notification.create({ data: notificationFixture(other) });
      let cursor: string | null = null;
      const ids: string[] = [];
      do {
        const result: request.Response = await request(app.getHttpServer())
          .get(base)
          .set(headers())
          .query({ limit: 2, ...(cursor ? { cursor } : {}), userId: other })
          .expect(200);
        ids.push(
          ...result.body.data.items.map((row: { id: string }) => row.id),
        );
        cursor = result.body.data.nextCursor;
      } while (cursor);
      expect(ids).toEqual(
        rows
          .map((row) => row.id)
          .sort()
          .reverse(),
      );
      const count = await request(app.getHttpServer())
        .get(`${base}/unread-count`)
        .set(headers())
        .expect(200);
      expect(count.body.data.count).toBe(4);
      expect(
        (
          await request(app.getHttpServer())
            .get(base)
            .query({ isRead: false })
            .set(headers())
            .expect(200)
        ).body.data.items,
      ).toHaveLength(4);
      expect(
        (
          await request(app.getHttpServer())
            .get(base)
            .query({ isRead: true })
            .set(headers())
            .expect(200)
        ).body.data.items,
      ).toHaveLength(1);
    });

    it.each([
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { limit: 'bad' },
      { isRead: 'yes' },
      { cursor: 'bad' },
    ])('rejects invalid pagination %#', async (query) => {
      await request(app.getHttpServer())
        .get(base)
        .set(headers())
        .query(query)
        .expect(400);
    });

    it('enforces notification ownership and preserves first-read timestamps, including concurrent requests', async () => {
      const own = await db.notification.create({
        data: notificationFixture(owner),
      });
      const foreign = await db.notification.create({
        data: notificationFixture(other),
      });
      expect(
        (
          await request(app.getHttpServer())
            .get(`${base}/${own.id}`)
            .set(headers())
            .expect(200)
        ).body.data.readAt,
      ).toBeNull();
      await request(app.getHttpServer())
        .get(`${base}/${foreign.id}`)
        .set(headers())
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${base}/${foreign.id}/read`)
        .set(headers())
        .expect(404);
      await request(app.getHttpServer())
        .get(`${base}/${randomUUID()}`)
        .set(headers())
        .expect(404);
      await request(app.getHttpServer())
        .get(`${base}/not-a-uuid`)
        .set(headers())
        .expect(400);
      const reads = await Promise.all(
        Array.from({ length: 3 }, () =>
          request(app.getHttpServer())
            .patch(`${base}/${own.id}/read`)
            .set(headers())
            .expect(200),
        ),
      );
      expect(new Set(reads.map((r) => r.body.data.readAt)).size).toBe(1);
      const again = await request(app.getHttpServer())
        .patch(`${base}/${own.id}/read`)
        .set(headers())
        .expect(200);
      expect(again.body.data.readAt).toBe(reads[0].body.data.readAt);
      expect(
        (await db.notification.findUniqueOrThrow({ where: { id: foreign.id } }))
          .readAt,
      ).toBeNull();
    });

    it('marks all unread notifications in one owned bulk update and preserves existing read timestamps', async () => {
      const readAt = new Date('2025-01-01T00:00:00Z');
      const read = await db.notification.create({
        data: notificationFixture(owner, { readAt }),
      });
      await db.notification.create({ data: notificationFixture(owner) });
      const foreign = await db.notification.create({
        data: notificationFixture(other),
      });
      expect(
        (
          await request(app.getHttpServer())
            .post(`${base}/read-all`)
            .set(headers())
            .expect(200)
        ).body.data.updatedCount,
      ).toBe(1);
      expect(
        (
          await request(app.getHttpServer())
            .post(`${base}/read-all`)
            .set(headers())
            .expect(200)
        ).body.data.updatedCount,
      ).toBe(0);
      expect(
        (await db.notification.findUniqueOrThrow({ where: { id: read.id } }))
          .readAt,
      ).toEqual(readAt);
      expect(
        (await db.notification.findUniqueOrThrow({ where: { id: foreign.id } }))
          .readAt,
      ).toBeNull();
      expect(
        (
          await request(app.getHttpServer())
            .get(`${base}/unread-count`)
            .set(headers())
            .expect(200)
        ).body.data.count,
      ).toBe(0);
    });

    it('returns preference defaults and persists only requested channels for the authenticated user', async () => {
      const defaults = {
        pushEnabled: true,
        inAppEnabled: true,
        emailEnabled: false,
      };
      expect(
        (
          await request(app.getHttpServer())
            .get(`${base}/preferences`)
            .set(headers())
            .expect(200)
        ).body.data,
      ).toEqual(defaults);
      expect(await db.notificationPreference.count()).toBe(0);
      expect(
        (
          await request(app.getHttpServer())
            .patch(`${base}/preferences`)
            .set(headers())
            .send({ pushEnabled: false, userId: other })
            .expect(200)
        ).body.data,
      ).toEqual({ ...defaults, pushEnabled: false });
      expect(
        (
          await request(app.getHttpServer())
            .patch(`${base}/preferences`)
            .set(headers())
            .send({ emailEnabled: true })
            .expect(200)
        ).body.data,
      ).toEqual({ pushEnabled: false, inAppEnabled: true, emailEnabled: true });
      expect(
        (
          await request(app.getHttpServer())
            .get(`${base}/preferences`)
            .set(headers(other))
            .expect(200)
        ).body.data,
      ).toEqual(defaults);
      expect(await db.notificationPreference.count()).toBe(1);
    });

    it('preserves independent channel changes in concurrent preference upserts', async () => {
      await Promise.all([
        request(app.getHttpServer())
          .patch(`${base}/preferences`)
          .set(headers())
          .send({ pushEnabled: false })
          .expect(200),
        request(app.getHttpServer())
          .patch(`${base}/preferences`)
          .set(headers())
          .send({ emailEnabled: true })
          .expect(200),
      ]);
      expect(
        (
          await request(app.getHttpServer())
            .get(`${base}/preferences`)
            .set(headers())
            .expect(200)
        ).body.data,
      ).toEqual({ pushEnabled: false, inAppEnabled: true, emailEnabled: true });
      expect(await db.notificationPreference.count()).toBe(1);
    });

    it.each([
      {},
      { pushEnabled: 'false' },
      { inAppEnabled: null },
      { emailEnabled: 1 },
      { userId: other },
    ])('rejects invalid preference patches %#', async (dto) => {
      await request(app.getHttpServer())
        .patch(`${base}/preferences`)
        .set(headers())
        .send(dto)
        .expect(400);
    });

    it('sanitizes database errors before the shared error filter can expose token data', async () => {
      const spy = vi
        .spyOn(db.deviceToken, 'updateMany')
        .mockRejectedValueOnce(new Error('secret-token database detail'));
      const response = await request(app.getHttpServer())
        .delete(`${base}/devices/${randomUUID()}`)
        .set(headers())
        .expect(503);
      expect(response.text).not.toContain('secret-token');
      expect(response.body.code).toBe('DEPENDENCY_UNAVAILABLE');
      spy.mockRestore();
    });
  },
);
