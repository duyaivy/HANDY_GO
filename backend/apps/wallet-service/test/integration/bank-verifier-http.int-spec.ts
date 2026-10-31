import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@app/config';
import { TokenVerifierService } from '@app/auth';
import { UserTrustPrismaService } from '@app/database';
import { UserTrustServiceController } from '../../../user-trust-service/src/user-trust-service.controller.js';
import { UserTrustServiceService } from '../../../user-trust-service/src/user-trust-service.service.js';
import { HttpBankAccountVerifier } from '../../src/withdrawal/bank-account-verifier/http-bank-account-verifier.js';

const SECRET = 'verifier-test-secret';
const API_PREFIX = 'api/v1';

function walletConfig(baseUrl: string | undefined, secret = SECRET, timeoutMs = 500) {
  return {
    getUrl: () => {
      if (!baseUrl) throw new Error('missing');
      return baseUrl;
    },
    apiPrefix: API_PREFIX,
    upstreamTimeoutMs: timeoutMs,
    internalServiceSecret: secret,
  } as never;
}

describe('HttpBankAccountVerifier với HTTP server giả lập (kiểm tra phân loại lỗi)', () => {
  let server: Server;
  let baseUrl: string;
  let handler: (req: IncomingMessage, res: ServerResponse) => void;
  let received: { url?: string; headers: IncomingMessage['headers']; body: string }[] = [];

  const json = (res: ServerResponse, status: number, payload: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ url: req.url, headers: req.headers, body });
        handler(req, res);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });
  beforeEach(() => {
    received = [];
    handler = (_req, res) => json(res, 200, { owned: true, active: true });
  });

  it('owned+active → true, gọi đúng prefix và gửi secret/body', async () => {
    expect(await new HttpBankAccountVerifier(walletConfig(baseUrl)).verify('u1', 'b1')).toBe(true);
    expect(received[0]!.url).toBe(`/${API_PREFIX}/internal/users/verify-bank-account`);
    expect(received[0]!.headers['x-internal-secret']).toBe(SECRET);
    expect(JSON.parse(received[0]!.body)).toEqual({ userId: 'u1', bankAccountId: 'b1' });
  });

  it.each([
    ['owned=false', { owned: false, active: true }],
    ['active=false', { owned: true, active: false }],
  ])('%s → false (từ chối rõ ràng)', async (_n, payload) => {
    handler = (_q, res) => json(res, 200, payload);
    expect(await new HttpBankAccountVerifier(walletConfig(baseUrl)).verify('u1', 'b1')).toBe(false);
  });

  it.each([
    ['thiếu active', 200, { owned: true }],
    ['owned dạng chuỗi', 200, { owned: 'true', active: true }],
    ['mảng', 200, []],
    ['null', 200, null],
    ['body hỏng', 200, '{not json'],
    ['404 sai prefix', 404, { message: 'not found' }],
    ['403 sai secret', 403, { message: 'forbidden' }],
    ['500', 500, { owned: true, active: true }],
  ])('%s → 503 (chưa xác minh được, không phải từ chối)', async (_n, status, payload) => {
    handler = (_q, res) => json(res, status, payload);
    await expect(new HttpBankAccountVerifier(walletConfig(baseUrl)).verify('u1', 'b1')).rejects.toMatchObject({ status: 503 });
  });

  it('timeout → 503 trong thời gian giới hạn', async () => {
    handler = () => undefined;
    const started = Date.now();
    await expect(new HttpBankAccountVerifier(walletConfig(baseUrl, SECRET, 200)).verify('u1', 'b1')).rejects.toMatchObject({ status: 503 });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('không cấu hình URL hoặc server tắt → 503', async () => {
    await expect(new HttpBankAccountVerifier(walletConfig(undefined)).verify('u1', 'b1')).rejects.toMatchObject({ status: 503 });
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    await expect(
      new HttpBankAccountVerifier(walletConfig(`http://127.0.0.1:${deadPort}`, SECRET, 300)).verify('u1', 'b1'),
    ).rejects.toMatchObject({ status: 503 });
  });
});

/**
 * Controller + service User Trust THẬT, phục vụ qua HTTP thật với global prefix như bootstrapApplication.
 * Chỉ bảng user_bank_accounts được thay bằng dữ liệu trong bộ nhớ (chưa chạy trên DB user-trust thật).
 */
describe('Wallet → User Trust thật qua HTTP internal', () => {
  const OWNER = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';
  const ACTIVE_ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const BLOCKED_USER_ACCOUNT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const accounts = [
      { id: ACTIVE_ACCOUNT, userId: OWNER, userStatus: 'active' },
      { id: BLOCKED_USER_ACCOUNT, userId: OTHER, userStatus: 'blocked' },
    ];
    const fakeDb = {
      userBankAccount: {
        findFirst: async ({ where }: { where: { id: string; userId: string; user: { status: string } } }) =>
          accounts.find((a) => a.id === where.id && a.userId === where.userId && a.userStatus === where.user.status) ?? null,
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [UserTrustServiceController],
      providers: [
        UserTrustServiceService,
        { provide: UserTrustPrismaService, useValue: fakeDb },
        { provide: TokenVerifierService, useValue: { verifyAccessToken: () => undefined } },
        { provide: ConfigService, useValue: { internalServiceSecret: SECRET, apiPrefix: API_PREFIX } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app.close();
  });

  const verifier = (secret = SECRET) => new HttpBankAccountVerifier(walletConfig(baseUrl, secret, 2000));

  it('tài khoản thuộc user active → true', async () => {
    expect(await verifier().verify(OWNER, ACTIVE_ACCOUNT)).toBe(true);
  });

  it('tài khoản của user khác hoặc không tồn tại → false', async () => {
    expect(await verifier().verify(OTHER, ACTIVE_ACCOUNT)).toBe(false);
    expect(await verifier().verify(OWNER, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toBe(false);
  });

  it('user không active → false', async () => {
    expect(await verifier().verify(OTHER, BLOCKED_USER_ACCOUNT)).toBe(false);
  });

  it('sai internal secret → 503 (cấu hình sai, không bị coi là từ chối)', async () => {
    await expect(verifier('wrong-secret').verify(OWNER, ACTIVE_ACCOUNT)).rejects.toMatchObject({ status: 503 });
  });

  it('URL không có prefix không tồn tại trên User Trust (chứng minh prefix là bắt buộc)', async () => {
    const res = await fetch(`${baseUrl}/internal/users/verify-bank-account`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
