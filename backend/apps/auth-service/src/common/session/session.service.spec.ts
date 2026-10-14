import { describe, expect, it, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AuthModule,
  AuthSignerModule,
  TokenSignerService,
  REFRESH_TOKEN_EXPIRATION_DAYS,
} from '@app/auth';
import { AuthPrismaService } from '@app/database';
import { AppException, ERROR_CODES } from '@app/common';
import { SessionService, type AccountWithRolesAndPermissions } from './session.service.js';
import { UserTrustClient } from '../rpc/user-trust.client.js';

describe('SessionService - Lưu trữ và Rotation Refresh Token (HG-31 Phase 2)', () => {
  let module: TestingModule;
  let sessionService: SessionService;
  let tokenSigner: TokenSignerService;
  let dbMock: any;
  let userTrustClientMock: any;

  const mockAccount: AccountWithRolesAndPermissions = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    phone: '0912345678',
    email: 'user@example.com',
    passwordHash: 'hashed_pw',
    status: 'active',
    emailVerifiedAt: new Date(),
    passwordChangedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [
      {
        accountId: '11111111-1111-1111-1111-111111111111',
        roleId: 'role-1',
        assignedAt: new Date(),
        role: {
          id: 'role-1',
          code: 'CUSTOMER',
          name: 'Customer',
          createdAt: new Date(),
          permissionRoles: [
            {
              permissionId: 'perm-1',
              roleId: 'role-1',
              assignedAt: new Date(),
              permission: {
                id: 'perm-1',
                code: 'auth:me',
                name: 'Auth Me',
                resource: 'auth',
                action: 'read',
                createdAt: new Date(),
              },
            },
          ],
        },
      },
    ],
  };

  beforeEach(async () => {
    dbMock = {
      refreshSession: {
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.data.id, ...args.data })),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'sess-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      account: {
        findUnique: vi.fn().mockResolvedValue(mockAccount),
      },
    };

    userTrustClientMock = {
      confirmUserStatus: vi.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      imports: [AuthModule, AuthSignerModule],
      providers: [
        SessionService,
        { provide: AuthPrismaService, useValue: dbMock },
        { provide: UserTrustClient, useValue: userTrustClientMock },
      ],
    }).compile();

    sessionService = module.get<SessionService>(SessionService);
    tokenSigner = module.get<TokenSignerService>(TokenSignerService);
  });

  describe('1. Lưu trữ Refresh Token khi Đăng nhập (createSession / saveSession)', () => {
    it('đăng nhập tạo bản ghi session có accountId, hash khác token rõ và expiresAt đúng 7 ngày', async () => {
      const session = await sessionService.createSession(mockAccount, '127.0.0.1', 'Mozilla/5.0');

      // 1. Kiểm tra session được tạo trả về token rõ
      expect(session.accessToken).toBeDefined();
      expect(session.refreshToken).toBeDefined();

      // 2. Kiểm tra bản ghi lưu xuống database
      expect(dbMock.refreshSession.create).toHaveBeenCalledOnce();
      const createCall = dbMock.refreshSession.create.mock.calls[0][0];
      const savedData = createCall.data;

      // 2a. Có đúng accountId liên kết
      expect(savedData.accountId).toBe(mockAccount.id);

      // 2b. Hash khác token rõ, không lưu token rõ vào database
      expect(savedData.refreshTokenHash).not.toBe(session.refreshToken);
      const expectedHash = crypto.createHash('sha256').update(session.refreshToken).digest('hex');
      expect(savedData.refreshTokenHash).toBe(expectedHash);

      // 2c. expiresAt đúng chuẩn 7 ngày (REFRESH_TOKEN_EXPIRATION_DAYS)
      const diffMs = savedData.expiresAt.getTime() - savedData.createdAt.getTime();
      const expectedMs = REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;
      expect(diffMs).toBe(expectedMs);

      // 2d. Lưu đúng IP và User-Agent
      expect(savedData.ipAddress).toBe('127.0.0.1');
      expect(savedData.userAgent).toBe('Mozilla/5.0');
    });
  });

  describe('2. Refresh hợp lệ và vô hiệu hóa token cũ', () => {
    it('refresh hợp lệ trả về token mới; sau rotation token cũ nhận 401', async () => {
      // Chuẩn bị session ban đầu
      const prep = await sessionService.prepareSession(mockAccount);
      const initialRefreshToken = prep.plainRefreshToken;
      const initialHash = prep.refreshTokenHash;

      // Mock session hợp lệ trong DB
      const dbSession = {
        id: prep.sessionId,
        accountId: mockAccount.id,
        refreshTokenHash: initialHash,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      };
      dbMock.refreshSession.findFirst.mockResolvedValue(dbSession);

      // 1. Thực hiện refresh lần đầu (hợp lệ)
      const rotated = await sessionService.rotateSession(initialRefreshToken, '127.0.0.1');
      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();
      expect(rotated.refreshToken).not.toBe(initialRefreshToken); // Token mới phải khác token cũ

      // 2. DB được cập nhật hash mới bằng compare-and-swap
      expect(dbMock.refreshSession.updateMany).toHaveBeenCalledOnce();
      const updateCall = dbMock.refreshSession.updateMany.mock.calls[0][0];
      expect(updateCall.where.refreshTokenHash).toBe(initialHash);
      const expectedNewHash = crypto.createHash('sha256').update(rotated.refreshToken).digest('hex');
      expect(updateCall.data.refreshTokenHash).toBe(expectedNewHash);

      // 3. Sau khi rotation, thử dùng lại token cũ (initialRefreshToken):
      // Trong DB thực tế hash đã đổi nên findFirst với initialHash trả về null
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      try {
        await sessionService.rotateSession(initialRefreshToken, '127.0.0.1');
        expect.fail('Should have thrown AppException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: ERROR_CODES.INVALID_REFRESH_TOKEN,
            message: 'Refresh token không hợp lệ hoặc đã hết hạn',
          }),
        );
      }
    });

    it('token mới sau rotation vẫn thuộc đúng tài khoản và session', async () => {
      const prep = await sessionService.prepareSession(mockAccount);
      const dbSession = {
        id: prep.sessionId,
        accountId: mockAccount.id,
        refreshTokenHash: prep.refreshTokenHash,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      };
      dbMock.refreshSession.findFirst.mockResolvedValue(dbSession);

      const rotated = await sessionService.rotateSession(prep.plainRefreshToken);

      expect(rotated.user.id).toBe(mockAccount.userId);
      expect(rotated.user.phone).toBe(mockAccount.phone);
      expect(rotated.user.roles).toEqual(['Customer']);
      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();
    });
  });

  describe('3. Compare-And-Swap (CAS) Protection', () => {
    it('khi updateMany trả về count: 0 (CAS fail / token đã bị rotation hoặc thu hồi), ném 401', async () => {
      const prep = await sessionService.prepareSession(mockAccount);
      const dbSession = {
        id: prep.sessionId,
        accountId: mockAccount.id,
        refreshTokenHash: prep.refreshTokenHash,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      };
      dbMock.refreshSession.findFirst.mockResolvedValue(dbSession);
      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        sessionService.rotateSession(prep.plainRefreshToken, '1.1.1.1'),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
          response: expect.objectContaining({
            code: ERROR_CODES.INVALID_REFRESH_TOKEN,
            message: 'Refresh token đã được sử dụng hoặc bị thu hồi',
          }),
        }),
      );
    });
  });

  describe('4. Token không tồn tại, đã thu hồi, hết hạn & Giới hạn phiên 7 ngày', () => {
    it('từ chối 401 khi refresh token không tìm thấy hoặc đã hết hạn / đã thu hồi trong DB', async () => {
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      await expect(
        sessionService.rotateSession('invalid-or-expired-token'),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
          response: expect.objectContaining({
            code: ERROR_CODES.INVALID_REFRESH_TOKEN,
            message: 'Refresh token không hợp lệ hoặc đã hết hạn',
          }),
        }),
      );

      // Đảm bảo câu truy vấn DB lọc đúng session chưa thu hồi và còn hạn
      expect(dbMock.refreshSession.findFirst).toHaveBeenCalledWith({
        where: {
          refreshTokenHash: expect.any(String),
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
      });
    });

    it('session quá 7 ngày tuyệt đối nhận 401 và bị thu hồi trong DB, không được gia hạn', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const expiredSession = {
        id: 'sess-8-days',
        accountId: mockAccount.id,
        refreshTokenHash: 'hash-8-days',
        createdAt: eightDaysAgo, // Đã tạo từ 8 ngày trước
        expiresAt: new Date(Date.now() + 10000),
        revokedAt: null,
      };
      dbMock.refreshSession.findFirst.mockResolvedValue(expiredSession);

      try {
        await sessionService.rotateSession('token-8-days');
        expect.fail('Should have thrown AppException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: ERROR_CODES.INVALID_REFRESH_TOKEN,
            message: 'Phiên đăng nhập đã hết hạn 7 ngày. Vui lòng đăng nhập lại.',
          }),
        );
      }

      // Phải đánh dấu revokedAt trong DB
      expect(dbMock.refreshSession.update).toHaveBeenCalledWith({
        where: { id: expiredSession.id },
        data: { revokedAt: expect.any(Date) },
      });

      // Tuyệt đối không gọi updateMany để rotate/gia hạn
      expect(dbMock.refreshSession.updateMany).not.toHaveBeenCalled();
    });

    it('session còn 2 ngày trong hạn 7 ngày tuyệt đối thì expiresAt mới bị giới hạn không vượt quá 7 ngày tuyệt đối', async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const activeSession = {
        id: 'sess-5-days',
        accountId: mockAccount.id,
        refreshTokenHash: 'hash-5-days',
        createdAt: fiveDaysAgo, // Đã tạo 5 ngày trước, còn đúng 2 ngày
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      };
      dbMock.refreshSession.findFirst.mockResolvedValue(activeSession);

      const rotated = await sessionService.rotateSession('token-5-days');
      expect(rotated.accessToken).toBeDefined();

      expect(dbMock.refreshSession.updateMany).toHaveBeenCalledOnce();
      const updateCall = dbMock.refreshSession.updateMany.mock.calls[0][0];
      const newExpiresAt: Date = updateCall.data.expiresAt;

      const absoluteExpiresAt = new Date(fiveDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000);
      // newExpiresAt phải xấp xỉ absoluteExpiresAt (còn ~2 ngày), không được cấp thêm 7 ngày mới
      expect(newExpiresAt.getTime()).toBeLessThanOrEqual(absoluteExpiresAt.getTime());
      expect(Math.abs(newExpiresAt.getTime() - absoluteExpiresAt.getTime())).toBeLessThan(5000);
    });
  });

  describe('5. Thu hồi session qua Logout (HG-31 Phase 3)', () => {
    it('gọi logout với Refresh Token hợp lệ đánh dấu session đã thu hồi (revokedAt: new Date)', async () => {
      const plainRefreshToken = await tokenSigner.signRefreshToken({
        accountId: mockAccount.id,
        userId: mockAccount.userId,
        sessionId: 'sess-logout-1',
      });
      const expectedHash = tokenSigner.hashToken(plainRefreshToken);

      await sessionService.revokeSession(plainRefreshToken);

      expect(dbMock.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { refreshTokenHash: expectedHash, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('sau khi logout, refresh bằng token đó nhận 401 INVALID_REFRESH_TOKEN', async () => {
      // Giả lập session đã bị thu hồi trong DB (revokedAt != null)
      // Khi rotateSession tìm kiếm với revokedAt: null -> findFirst trả về null
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      const plainRefreshToken = await tokenSigner.signRefreshToken({
        accountId: mockAccount.id,
        userId: mockAccount.userId,
        sessionId: 'sess-logout-revoked',
      });

      try {
        await sessionService.rotateSession(plainRefreshToken);
        expect.fail('Should have thrown AppException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: ERROR_CODES.INVALID_REFRESH_TOKEN,
            message: 'Refresh token không hợp lệ hoặc đã hết hạn',
          }),
        );
      }
    });

    it('logout với token không khớp hoặc đã thu hồi hoàn thành êm dịu (idempotent)', async () => {
      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        sessionService.revokeSession('non-existent-or-mismatched-token'),
      ).resolves.toBeUndefined();

      expect(dbMock.refreshSession.updateMany).toHaveBeenCalledOnce();
      expect(dbMock.refreshSession.create).not.toHaveBeenCalled();
    });
  });
});

