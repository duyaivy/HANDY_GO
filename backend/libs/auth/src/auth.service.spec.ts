import crypto from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthModule, AuthSignerModule } from './auth.module.js';
import { TokenVerifierService } from './token-verifier.service.js';
import { TokenSignerService } from './token-signer.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { TokenType } from './auth.types.js';

const alternateKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

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

  it('should allow AuthSignerModule to sign and TokenVerifierService to verify RS256 token claims with tokenType: access', async () => {
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
    expect(payload.tokenType).toBe(TokenType.ACCESS);
    expect(payload.iss).toBe('handy-go-auth');
    expect(payload.aud).toBe('handy-go-api');
  });

  describe('Phân biệt Access Token và Refresh Token', () => {
    let signer: TokenSignerService;
    let verifier: TokenVerifierService;
    let jwtService: JwtService;
    let privateKey: string;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [AuthModule, AuthSignerModule],
      }).compile();

      signer = module.get<TokenSignerService>(TokenSignerService);
      verifier = module.get<TokenVerifierService>(TokenVerifierService);
      jwtService = module.get<JwtService>(JwtService);
      privateKey = (signer as any).privateKey;
    });

    it('1. Access Token mới có tokenType: access và verifier chấp nhận', async () => {
      const { token } = await signer.signAccessToken({
        accountId: 'acc-new',
        userId: 'user-new',
        sessionId: 'sess-new',
        roles: ['Customer'],
        permissions: ['auth:me'],
      });

      const payload = await verifier.verifyAccessToken(token);
      expect(payload.tokenType).toBe(TokenType.ACCESS);
      expect(payload.sub).toBe('acc-new');
    });

    it('2. Access Token cũ không có tokenType vẫn được chấp nhận trong giai đoạn chuyển tiếp', async () => {
      const legacyToken = await jwtService.signAsync(
        {
          sub: 'acc-legacy',
          userId: 'user-legacy',
          sid: 'sess-legacy',
          roles: ['Worker'],
          permissions: ['profile:read'],
          iss: 'handy-go-auth',
          aud: 'handy-go-api',
          jti: 'legacy-jti-123',
          // không có tokenType
        },
        {
          algorithm: 'RS256',
          privateKey,
          expiresIn: '5m',
        },
      );

      const payload = await verifier.verifyAccessToken(legacyToken);
      expect(payload.tokenType).toBeUndefined();
      expect(payload.sub).toBe('acc-legacy');
      expect(payload.roles).toEqual(['Worker']);
    });

    it('3. Verifier từ chối Refresh Token (tokenType: refresh) khi dùng làm Access Token', async () => {
      const refreshToken = await signer.signRefreshToken({
        accountId: 'acc-refresh',
        userId: 'user-refresh',
        sessionId: 'sess-refresh',
      });

      await expect(verifier.verifyAccessToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(verifier.verifyAccessToken(refreshToken)).rejects.toThrow(
        'Refresh token không được phép sử dụng làm mã truy cập',
      );
    });

    it('4. Verifier từ chối Access Token có tokenType không hợp lệ', async () => {
      const weirdToken = await jwtService.signAsync(
        {
          sub: 'acc-weird',
          userId: 'user-weird',
          sid: 'sess-weird',
          tokenType: 'unknown_token_type',
          iss: 'handy-go-auth',
          aud: 'handy-go-api',
          jti: 'weird-jti',
        },
        {
          algorithm: 'RS256',
          privateKey,
          expiresIn: '5m',
        },
      );

      await expect(verifier.verifyAccessToken(weirdToken)).rejects.toThrow(
        'Loại mã truy cập không hợp lệ',
      );
    });

    it.each([
      [
        'chữ ký RS256 không hợp lệ (ký bằng khóa lạ)',
        () =>
          jwtService.signAsync(
            {
              sub: 'acc-fake',
              userId: 'user-fake',
              sid: 'sess-fake',
              tokenType: TokenType.ACCESS,
              iss: 'handy-go-auth',
              aud: 'handy-go-api',
              jti: 'fake-jti',
            },
            {
              algorithm: 'RS256',
              privateKey: alternateKeyPair.privateKey,
              expiresIn: '5m',
            },
          ),
      ],
      [
        'issuer không hợp lệ',
        () =>
          jwtService.signAsync(
            {
              sub: 'acc-iss',
              userId: 'user-iss',
              sid: 'sess-iss',
              tokenType: 'access',
              iss: 'malicious-issuer',
              aud: 'handy-go-api',
              jti: 'iss-jti',
            },
            {
              algorithm: 'RS256',
              privateKey,
              expiresIn: '5m',
            },
          ),
      ],
      [
        'audience không hợp lệ',
        () =>
          jwtService.signAsync(
            {
              sub: 'acc-aud',
              userId: 'user-aud',
              sid: 'sess-aud',
              tokenType: 'access',
              iss: 'handy-go-auth',
              aud: 'wrong-audience',
              jti: 'aud-jti',
            },
            {
              algorithm: 'RS256',
              privateKey,
              expiresIn: '5m',
            },
          ),
      ],
      [
        'token đã hết hạn',
        () =>
          jwtService.signAsync(
            {
              sub: 'acc-exp',
              userId: 'user-exp',
              sid: 'sess-exp',
              tokenType: 'access',
              iss: 'handy-go-auth',
              aud: 'handy-go-api',
              jti: 'exp-jti',
            },
            {
              algorithm: 'RS256',
              privateKey,
              expiresIn: '-10s',
            },
          ),
      ],
    ])('5-8. Verifier từ chối token có %s', async (_, generateToken) => {
      const token = await generateToken();
      await expect(verifier.verifyAccessToken(token)).rejects.toThrow(
        'Mã truy cập không hợp lệ hoặc đã hết hạn',
      );
    });

    it('9. verifyRefreshToken xác minh thành công Refresh Token hợp lệ (RS256, issuer, audience, tokenType: refresh)', async () => {
      const refreshToken = await signer.signRefreshToken({
        accountId: 'acc-rf-1',
        userId: 'user-rf-1',
        sessionId: 'sess-rf-1',
      });

      const payload = await verifier.verifyRefreshToken(refreshToken);
      expect(payload.tokenType).toBe(TokenType.REFRESH);
      expect(payload.sub).toBe('acc-rf-1');
      expect(payload.userId).toBe('user-rf-1');
      expect(payload.sid).toBe('sess-rf-1');
    });

    it('10. verifyRefreshToken từ chối Access Token (không phải tokenType: refresh)', async () => {
      const { token: accessToken } = await signer.signAccessToken({
        accountId: 'acc-rf-2',
        userId: 'user-rf-2',
        sessionId: 'sess-rf-2',
        roles: ['Customer'],
        permissions: [],
      });

      await expect(verifier.verifyRefreshToken(accessToken)).rejects.toThrow(
        'Token không phải là refresh token',
      );
    });

    it('11. verifyRefreshToken kiểm tra và ràng buộc đúng sub, userId, sid với session', async () => {
      const refreshToken = await signer.signRefreshToken({
        accountId: 'acc-session-1',
        userId: 'user-session-1',
        sessionId: 'sess-session-1',
      });

      // 11a. Khớp hoàn toàn cả 3 trường
      const validPayload = await verifier.verifyRefreshToken(refreshToken, {
        id: 'sess-session-1',
        accountId: 'acc-session-1',
        userId: 'user-session-1',
      });
      expect(validPayload.sid).toBe('sess-session-1');

      // 11b. Sai sessionId (sid)
      await expect(
        verifier.verifyRefreshToken(refreshToken, {
          id: 'sess-wrong',
          accountId: 'acc-session-1',
          userId: 'user-session-1',
        }),
      ).rejects.toThrow('Refresh token không khớp với phiên làm việc (sid)');

      // 11c. Sai accountId (sub)
      await expect(
        verifier.verifyRefreshToken(refreshToken, {
          id: 'sess-session-1',
          accountId: 'acc-wrong',
          userId: 'user-session-1',
        }),
      ).rejects.toThrow('Refresh token không khớp với tài khoản (sub)');

      // 11d. Sai userId
      await expect(
        verifier.verifyRefreshToken(refreshToken, {
          id: 'sess-session-1',
          accountId: 'acc-session-1',
          userId: 'user-wrong',
        }),
      ).rejects.toThrow('Refresh token không khớp với người dùng (userId)');
    });

    it('12. generateRefreshToken và hashToken sinh token ngẫu nhiên và hash SHA-256 đúng', () => {
      const token = verifier.generateRefreshToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes hex = 64 hex chars

      const hash1 = verifier.hashToken(token);
      const hash2 = verifier.hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('13. verifyRefreshToken từ chối token thiếu sub, userId hoặc sid', async () => {
      const missingSubToken = await jwtService.signAsync(
        {
          tokenType: 'refresh',
          userId: 'user-1',
          sid: 'sid-1',
          iss: 'handy-go-auth',
          aud: 'handy-go-api',
        },
        {
          algorithm: 'RS256',
          privateKey,
          expiresIn: '7d',
        },
      );

      await expect(verifier.verifyRefreshToken(missingSubToken)).rejects.toThrow(
        'Refresh token thiếu thông tin định danh',
      );
    });
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
    const originalPriv = process.env.JWT_PRIVATE_KEY;
    // Set private key to the alternate pair while public key is default
    process.env.JWT_PRIVATE_KEY = alternateKeyPair.privateKey;

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

