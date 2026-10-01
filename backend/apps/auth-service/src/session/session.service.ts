import { HttpStatus, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/auth-client';
import { AuthPrismaService } from '@app/database';
import { REFRESH_TOKEN_EXPIRATION_DAYS, TokenSignerService } from '@app/auth';
import { AppException, ERROR_CODES } from '@app/common';
import type { UserSummaryDto } from '../login/dto/auth-responses.dto.js';
import { UserTrustClient } from '../rpc/user-trust.client.js';

export type AccountWithRolesAndPermissions = Prisma.AccountGetPayload<{
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissionRoles: {
              include: {
                permission: true;
              };
            };
          };
        };
      };
    };
  };
}>;

export interface PreparedSession {
  token: string;
  expiresIn: number;
  plainRefreshToken: string;
  refreshTokenHash: string;
  sessionId: string;
  sessionCreatedAt: Date;
  sessionExpiresAt: Date;
  roleNames: string[];
  permissions: string[];
  user: UserSummaryDto;
}

export interface SaveSessionParams {
  sessionId: string;
  accountId: string;
  refreshTokenHash: string;
  sessionCreatedAt: Date;
  sessionExpiresAt: Date;
  clientIp?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly db: AuthPrismaService,
    public readonly tokenSigner: TokenSignerService,
    private readonly userTrustClient: UserTrustClient,
  ) {}

  extractRolesAndPermissions(account: AccountWithRolesAndPermissions): {
    roleNames: string[];
    permissions: string[];
  } {
    const roleNames = account.roles.map((r) => r.role.name);
    const permissions = Array.from(
      new Set(
        account.roles.flatMap((r) =>
          r.role.permissionRoles.map((rp) => rp.permission.code),
        ),
      ),
    );
    return { roleNames, permissions };
  }

  /**
   * Prepares and signs JWT access token FIRST before any database state is modified.
   */
  async prepareSession(
    account: AccountWithRolesAndPermissions,
    _clientIp?: string,
    _userAgent?: string,
  ): Promise<PreparedSession> {

    const sessionId = crypto.randomUUID();
    const sessionCreatedAt = new Date();
    const plainRefreshToken = this.tokenSigner.generateRefreshToken();
    const refreshTokenHash = this.tokenSigner.hashToken(plainRefreshToken);
    const sessionExpiresAt = new Date(
      sessionCreatedAt.getTime() +
        REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
    );

    const { roleNames, permissions } = this.extractRolesAndPermissions(account);

    // Sign access token FIRST before writing to DB
    const { token, expiresIn } = await this.tokenSigner.signAccessToken({
      accountId: account.id,
      userId: account.userId,
      sessionId,
      roles: roleNames,
      permissions,
    });

    const user: UserSummaryDto = {
      id: account.userId,
      phone: account.phone,
      email: account.email,
      roles: roleNames,
      permissions,
    };

    return {
      token,
      expiresIn,
      plainRefreshToken,
      refreshTokenHash,
      sessionId,
      sessionCreatedAt,
      sessionExpiresAt,
      roleNames,
      permissions,
      user,
    };
  }

  /**
   * Persists a prepared session to the database. Supports passing a transaction client
   * so verifyOtp can commit session creation atomically with account activation.
   */
  async saveSession(
    client: Prisma.TransactionClient | AuthPrismaService,
    params: SaveSessionParams,
  ): Promise<void> {
    await client.refreshSession.create({
      data: {
        id: params.sessionId,
        accountId: params.accountId,
        refreshTokenHash: params.refreshTokenHash,
        expiresAt: params.sessionExpiresAt,
        createdAt: params.sessionCreatedAt,
        ipAddress: params.clientIp,
        userAgent: params.userAgent,
      },
    });
  }

  /**
   * Creates a session end-to-end: signs access token first, then writes session to database.
   */
  async createSession(
    account: AccountWithRolesAndPermissions,
    clientIp?: string,
    userAgent?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: UserSummaryDto;
  }> {
    const prep = await this.prepareSession(account, clientIp, userAgent);

    await this.saveSession(this.db, {
      sessionId: prep.sessionId,
      accountId: account.id,
      refreshTokenHash: prep.refreshTokenHash,
      sessionCreatedAt: prep.sessionCreatedAt,
      sessionExpiresAt: prep.sessionExpiresAt,
      clientIp,
      userAgent,
    });

    return {
      accessToken: prep.token,
      refreshToken: prep.plainRefreshToken,
      expiresIn: prep.expiresIn,
      user: prep.user,
    };
  }

  /**
   * Rotates an existing refresh token with 7-day absolute lifetime enforcement.
   */
  async rotateSession(
    refreshToken: string,
    clientIp?: string,
    userAgent?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: UserSummaryDto;
  }> {
    const hashed = this.tokenSigner.hashToken(refreshToken);
    const now = new Date();

    const session = await this.db.refreshSession.findFirst({
      where: {
        refreshTokenHash: hashed,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!session) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    // Absolute 7-day session lifetime check
    const absoluteExpiresAt = new Date(
      session.createdAt.getTime() +
        REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
    );
    if (absoluteExpiresAt <= now) {
      await this.db.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Phiên đăng nhập đã hết hạn 7 ngày. Vui lòng đăng nhập lại.',
      );
    }

    const account = await this.db.account.findUnique({
      where: { id: session.accountId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissionRoles: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account || account.status !== 'active' || !account.emailVerifiedAt) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản không hợp lệ hoặc đã bị khóa',
      );
    }

    // Verify user status in User & Trust
    await this.userTrustClient.confirmUserStatus(
      account.userId,
      account.roles.map(({ role }) => role.name),
    );

    // Rotate refresh token: prepare new credentials
    const newPlainRefreshToken = this.tokenSigner.generateRefreshToken();
    const newRefreshTokenHash = this.tokenSigner.hashToken(newPlainRefreshToken);
    const next7Days = new Date(
      now.getTime() + REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
    );
    const newExpiresAt = new Date(
      Math.min(next7Days.getTime(), absoluteExpiresAt.getTime()),
    );

    const { roleNames, permissions } = this.extractRolesAndPermissions(account);

    // Sign new access token FIRST before modifying DB state
    const { token, expiresIn } = await this.tokenSigner.signAccessToken({
      accountId: account.id,
      userId: account.userId,
      sessionId: session.id,
      roles: roleNames,
      permissions,
    });

    // Rotate refresh token in DB only after successful signing
    const updateResult = await this.db.refreshSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: hashed, // Must still match old hash to prevent race conditions
        revokedAt: null,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
        ipAddress: clientIp,
        userAgent,
      },
    });

    if (updateResult.count === 0) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Refresh token đã được sử dụng hoặc bị thu hồi',
      );
    }

    return {
      accessToken: token,
      refreshToken: newPlainRefreshToken,
      expiresIn,
      user: {
        id: account.userId,
        phone: account.phone,
        email: account.email,
        roles: roleNames,
        permissions,
      },
    };
  }

  /**
   * Revokes a session given a refresh token.
   */
  async revokeSession(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }
    const hashed = this.tokenSigner.hashToken(refreshToken);
    await this.db.refreshSession.updateMany({
      where: { refreshTokenHash: hashed, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
