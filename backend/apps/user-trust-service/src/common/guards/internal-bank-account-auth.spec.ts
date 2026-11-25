import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { JwtAuthGuard, PermissionsGuard, TokenVerifierService } from '@app/auth';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { UserTrustServiceController } from '../../user-trust-service.controller.js';
import { UserTrustServiceService } from '../../user-trust-service.service.js';
import { InternalServiceGuard } from './internal-service.guard.js';

describe('Bank ownership verification with real global HTTP auth guards', () => {
  let app: INestApplication;
  const secret = 'sandbox-internal-secret-for-http-tests';
  const payload = { userId: '00000000-0000-4000-8000-000000000001', bankAccountId: '00000000-0000-4000-8000-000000000002' };
  const service = { verifyBankAccountOwnership: vi.fn() };
  const verifier = { verifyAccessToken: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserTrustServiceController],
      providers: [
        InternalServiceGuard,
        { provide: ConfigService, useValue: { internalServiceSecret: secret } },
        { provide: TokenVerifierService, useValue: verifier },
        { provide: UserTrustServiceService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    const reflector = new Reflector();
    app.useGlobalGuards(new JwtAuthGuard(reflector, verifier as unknown as TokenVerifierService), new PermissionsGuard(reflector));
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    service.verifyBankAccountOwnership.mockResolvedValue({ owned: true, active: true });
  });
  afterAll(async () => { await app?.close(); });
  it('accepts the internal service secret without requiring an end-user JWT', async () => {
    const result = await request(app.getHttpServer()).post('/internal/users/verify-bank-account').set('x-internal-secret', secret).send(payload).expect(200);
    expect(result.body).toEqual({ owned: true, active: true });
    expect(service.verifyBankAccountOwnership).toHaveBeenCalledWith(payload.userId, payload.bankAccountId);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });
  it.each([undefined, 'invalid-secret'])('rejects missing or invalid internal credentials (%s)', async (value) => {
    const call = request(app.getHttpServer()).post('/internal/users/verify-bank-account');
    if (value) call.set('x-internal-secret', value);
    await call.send(payload).expect(403);
    expect(service.verifyBankAccountOwnership).not.toHaveBeenCalled();
  });
  it('preserves a negative ownership result and validates required fields', async () => {
    service.verifyBankAccountOwnership.mockResolvedValue({ owned: false, active: true });
    const result = await request(app.getHttpServer()).post('/internal/users/verify-bank-account').set('x-internal-secret', secret).send(payload).expect(200);
    expect(result.body).toEqual({ owned: false, active: true });
    await request(app.getHttpServer()).post('/internal/users/verify-bank-account').set('x-internal-secret', secret).send({ userId: payload.userId }).expect(400);
    expect(service.verifyBankAccountOwnership).toHaveBeenCalledTimes(1);
  });
  it('keeps the public bank-account route protected by end-user JWT auth', async () => {
    await request(app.getHttpServer()).get('/users/me/bank-accounts').expect(401);
  });
});
