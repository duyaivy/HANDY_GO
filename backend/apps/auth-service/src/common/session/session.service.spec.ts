import { describe, expect, it, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AuthModule,
  AuthSignerModule,
  TokenSignerService,
  TokenVerifierService,
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
  let tokenVerifier: TokenVerifierService;
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
    tokenVerifier = module.get<TokenVerifierService>(TokenVerifierService);
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

      // Decode token mới xem có đúng sessionId không
      const decodedAccess = await tokenVerifier.verifyAccessToken(rotated.accessToken);
      expect(decodedAccess.sub).toBe(mockAccount.id);
      expect(decodedAccess.sid).toBe(prep.sessionId);

      const decodedRefresh = await tokenVerifier.verifyRefreshToken(rotated.refreshToken);
      expect(decodedRefresh.sub).toBe(mockAccount.id);
      expect(decodedRefresh.sid).toBe(prep.sessionId);
    });
  });

  describe('3. Concurrency & Compare-And-Swap (CAS)', () => {
    it('hai refresh đồng thời chỉ có đúng một yêu cầu thành công, yêu cầu còn lại nhận 401', async () => {
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

      // Mô phỏng đua tranh (Race condition):
      // Cả hai cùng đọc được session với refreshTokenHash cũ từ DB.
      // Request A đến trước: updateMany thành công (count: 1).
      // Request B đến sau: refreshTokenHash trong DB đã đổi => updateMany thất bại (count: 0).
      let isFirstCall = true;
      dbMock.refreshSession.updateMany.mockImplementation(() => {
        if (isFirstCall) {
          isFirstCall = false;
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 }); // CAS failed
      });

      const [res1, res2] = await Promise.allSettled([
        sessionService.rotateSession(prep.plainRefreshToken, '1.1.1.1'),
        sessionService.rotateSession(prep.plainRefreshToken, '2.2.2.2'),
      ]);

      // Đúng 1 request thành công (fulfilled)
      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      // Request còn lại bị từ chối với 401 (rejected)
      const rejected = [res1, res2].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(AppException);
      expect(rejected[0].reason.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(rejected[0].reason.getResponse()).toEqual(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_REFRESH_TOKEN,
          message: 'Refresh token đã được sử dụng hoặc bị thu hồi',
        }),
      );
    });
  });

  describe('4. Token không tồn tại, đã thu hồi, hết hạn & Giới hạn phiên 7 ngày', () => {
    it('token không tồn tại trong DB nhận 401', async () => {
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      try {
        await sessionService.rotateSession('non-existent-token');
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

    it('token đã bị thu hồi (revokedAt != null) nhận 401', async () => {
      // Do câu query findFirst có revokedAt: null nên DB trả về null
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      try {
        await sessionService.rotateSession('revoked-token');
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

    it('token đã hết hạn (expiresAt <= now) nhận 401', async () => {
      // Do câu query findFirst có expiresAt: { gt: now } nên DB trả về null
      dbMock.refreshSession.findFirst.mockResolvedValue(null);

      try {
        await sessionService.rotateSession('expired-token');
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

  describe('3. Thu hồi session qua Logout & Bảo mật Refresh Token (HG-31 Phase 3)', () => {
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

    it('Refresh Token sau khi logout không thể được Gateway/Verifier nhận nhầm là Access Token', async () => {
      const plainRefreshToken = await tokenSigner.signRefreshToken({
        accountId: mockAccount.id,
        userId: mockAccount.userId,
        sessionId: 'sess-logout-token',
      });

      // Token có tokenType: 'refresh', verifier Access Token luôn từ chối dù session đã thu hồi hay chưa
      await expect(
        tokenVerifier.verifyAccessToken(plainRefreshToken),
      ).rejects.toThrow('Refresh token không được phép sử dụng làm mã truy cập');
    });

    it('logout với token không khớp vẫn hoàn thành bình thường, không tiết lộ trạng thái session (idempotent)', async () => {
      // updateMany trả về count: 0 (không tìm thấy session hoặc token sai)
      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 0 });

      // Không ném lỗi
      await expect(
        sessionService.revokeSession('non-existent-or-mismatched-token'),
      ).resolves.toBeUndefined();

      expect(dbMock.refreshSession.updateMany).toHaveBeenCalledOnce();
      expect(dbMock.refreshSession.create).not.toHaveBeenCalled();
    });

    it('gọi lại logout với cùng một token không làm phát sinh lỗi hoặc tạo session mới (idempotent)', async () => {
      dbMock.refreshSession.updateMany.mockResolvedValue({ count: 0 });

      // Gọi lần 1
      await expect(
        sessionService.revokeSession('already-revoked-token'),
      ).resolves.toBeUndefined();

      // Gọi lần 2
      await expect(
        sessionService.revokeSession('already-revoked-token'),
      ).resolves.toBeUndefined();

      // Không tạo session mới
      expect(dbMock.refreshSession.create).not.toHaveBeenCalled();
    });
  });
});

