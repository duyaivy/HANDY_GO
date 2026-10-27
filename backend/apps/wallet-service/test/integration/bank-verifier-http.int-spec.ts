import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpBankAccountVerifier } from '../../src/withdrawal/bank-account-verifier/http-bank-account-verifier.js';

const SECRET = 'verifier-test-secret';
let server: Server;
let port: number;
let handler: (req: IncomingMessage, res: ServerResponse, body: string) => void;
let received: { headers: IncomingMessage['headers']; body: string }[] = [];

function verifier(opts: { path?: string; secret?: string; timeoutMs?: number; noUrl?: boolean } = {}) {
  const config = {
    getUrl: () => {
      if (opts.noUrl) throw new Error('missing');
      return `http://127.0.0.1:${port}${opts.path ?? '/verify'}`;
    },
    upstreamTimeoutMs: opts.timeoutMs ?? 500,
    internalServiceSecret: opts.secret ?? SECRET,
  };
  return new HttpBankAccountVerifier(config as never);
}

const json = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  received = [];
  handler = (req, res) => {
    if (req.url !== '/verify' || req.headers['x-internal-secret'] !== SECRET) return json(res, 403, { message: 'forbidden' });
    json(res, 200, { owned: true, active: true });
  };
});

describe('HttpBankAccountVerifier với HTTP server thật (fake user-trust)', () => {
  it('owned+active → true và gửi đúng secret/body', async () => {
    expect(await verifier().verify('u1', 'b1')).toBe(true);
    expect(received[0].headers['x-internal-secret']).toBe(SECRET);
    expect(JSON.parse(received[0].body)).toEqual({ userId: 'u1', bankAccountId: 'b1' });
  });

  it.each([
    ['owned=false', { owned: false, active: true }],
    ['active=false', { owned: true, active: false }],
    ['thiếu active', { owned: true }],
    ['owned dạng chuỗi', { owned: 'true', active: true }],
    ['mảng', []],
    ['null', null],
  ])('%s → false', async (_n, payload) => {
    handler = (_q, res) => json(res, 200, payload);
    expect(await verifier().verify('u1', 'b1')).toBe(false);
  });

  it('sai secret → 403 → false', async () => {
    expect(await verifier({ secret: 'wrong' }).verify('u1', 'b1')).toBe(false);
  });

  it('sai URL/prefix → 404 → false', async () => {
    handler = (_q, res) => json(res, 404, { message: 'not found' });
    expect(await verifier({ path: '/api/v1/nope' }).verify('u1', 'b1')).toBe(false);
  });

  it('5xx, body hỏng → false', async () => {
    handler = (_q, res) => json(res, 500, { owned: true, active: true });
    expect(await verifier().verify('u1', 'b1')).toBe(false);
    handler = (_q, res) => json(res, 200, '{not json');
    expect(await verifier().verify('u1', 'b1')).toBe(false);
  });

  it('timeout → false (fail-closed)', async () => {
    handler = () => undefined;
    const started = Date.now();
    expect(await verifier({ timeoutMs: 200 }).verify('u1', 'b1')).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('không cấu hình URL hoặc server tắt → false', async () => {
    expect(await verifier({ noUrl: true }).verify('u1', 'b1')).toBe(false);
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const v = new HttpBankAccountVerifier({
      getUrl: () => `http://127.0.0.1:${deadPort}/verify`,
      upstreamTimeoutMs: 300,
      internalServiceSecret: SECRET,
    } as never);
    expect(await v.verify('u1', 'b1')).toBe(false);
  });
});
