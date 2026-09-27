import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AuthModule, AuthSignerModule } from './auth.module.js';
import { TokenVerifierService } from './token-verifier.service.js';
import { TokenSignerService } from './token-signer.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

describe('AuthModule & Token Architecture', () => {
  it('should compile AuthModule and provide verifier and guards without needing signer or private key', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    const verifier = module.get<TokenVerifierService>(TokenVerifierService);
    const jwtGuard = module.get<JwtAuthGuard>(JwtAuthGuard);
    const permGuard = module.get<PermissionsGuard>(PermissionsGuard);

    expect(verifier).toBeDefined();
    expect(jwtGuard).toBeDefined();
    expect(permGuard).toBeDefined();
  });

  it('should ensure non-signer services (AuthModule only) do NOT provide TokenSignerService', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    expect(() => module.get<TokenSignerService>(TokenSignerService)).toThrow();
  });

  it('should allow AuthSignerModule to sign and TokenVerifierService to verify RS256 token claims', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, AuthSignerModule],
    }).compile();

    const signer = module.get<TokenSignerService>(TokenSignerService);
    const verifier = module.get<TokenVerifierService>(TokenVerifierService);

    const { token, expiresIn } = await signer.signAccessToken({
      accountId: 'acc-123',
      userId: 'user-123',
      sessionId: 'sess-123',
      roles: ['Customer'],
      permissions: ['auth:me', 'profile:read'],
    });

    expect(expiresIn).toBe(300);
    expect(token).toBeDefined();

    const payload = await verifier.verifyAccessToken(token);
    expect(payload.sub).toBe('acc-123');
    expect(payload.userId).toBe('user-123');
    expect(payload.sid).toBe('sess-123');
    expect(payload.roles).toEqual(['Customer']);
    expect(payload.permissions).toEqual(['auth:me', 'profile:read']);
    expect(payload.iss).toBe('handy-go-auth');
    expect(payload.aud).toBe('handy-go-api');
  });

  it('should allow non-HTTP contexts (like RabbitMQ) to bypass JwtAuthGuard and PermissionsGuard', async () => {
    const mockContext = {
      getType: () => 'rpc',
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    const jwtGuard = module.get<JwtAuthGuard>(JwtAuthGuard);
    const permGuard = module.get<PermissionsGuard>(PermissionsGuard);

    await expect(jwtGuard.canActivate(mockContext)).resolves.toBe(true);
    expect(permGuard.canActivate(mockContext)).toBe(true);
  });

  it('should fail fast on startup if JWT public key is malformed', async () => {
    const originalKey = process.env.JWT_PUBLIC_KEY;
    process.env.JWT_PUBLIC_KEY = 'invalid-not-a-pem-key';

    try {
      await expect(
        Test.createTestingModule({
          imports: [AuthModule],
        }).compile(),
      ).rejects.toThrow('Khóa công khai JWT không hợp lệ');
    } finally {
      if (originalKey !== undefined) {
        process.env.JWT_PUBLIC_KEY = originalKey;
      } else {
        delete process.env.JWT_PUBLIC_KEY;
      }
    }
  });

  it('should fail fast on startup if JWT keypair does not match', async () => {
    // Generate an alternate RS256 keypair
    const crypto = await import('node:crypto');
    const altPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const originalPriv = process.env.JWT_PRIVATE_KEY;
    // Set private key to the alternate pair while public key is default
    process.env.JWT_PRIVATE_KEY = altPair.privateKey;

    try {
      await expect(
        Test.createTestingModule({
          imports: [AuthModule, AuthSignerModule],
        }).compile(),
      ).rejects.toThrow('Cặp khóa JWT không khớp');
    } finally {
      if (originalPriv !== undefined) {
        process.env.JWT_PRIVATE_KEY = originalPriv;
      } else {
        delete process.env.JWT_PRIVATE_KEY;
      }
    }
  });
});

