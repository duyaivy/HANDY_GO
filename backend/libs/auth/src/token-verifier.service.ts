import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'node:crypto';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';
import type {
  JwtPayload,
  RefreshTokenPayload,
  SessionBinding,
} from './auth.types.js';
import { resolvePublicKey } from './key-resolver.util.js';

@Injectable()
export class TokenVerifierService {
  private readonly publicKey: string;

  constructor(private readonly jwtService: JwtService) {
    this.publicKey = resolvePublicKey();
    this.validateKey();
  }

  private validateKey(): void {
    try {
      const keyObj = crypto.createPublicKey(this.publicKey);
      if (keyObj.asymmetricKeyType !== 'rsa') {
        throw new Error(
          `Khóa công khai JWT phải có định dạng RSA (nhận được: ${keyObj.asymmetricKeyType})`,
        );
      }
    } catch (err: any) {
      throw new Error(`Khóa công khai JWT không hợp lệ: ${err.message}`);
    }
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['RS256'],
        publicKey: this.publicKey,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      // Từ chối Refresh Token khi dùng làm Access Token
      if (payload.tokenType === 'refresh') {
        throw new UnauthorizedException(
          'Refresh token không được phép sử dụng làm mã truy cập',
        );
      }

      // Token có tokenType khác 'access' (nếu có khai báo) cũng bị từ chối
      // Trong giai đoạn chuyển tiếp, token cũ chưa có tokenType (undefined) vẫn được chấp nhận
      if (payload.tokenType !== undefined && payload.tokenType !== 'access') {
        throw new UnauthorizedException('Loại mã truy cập không hợp lệ');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Mã truy cập không hợp lệ hoặc đã hết hạn');
    }
  }

  async verifyRefreshToken(
    token: string,
    session?: SessionBinding,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        algorithms: ['RS256'],
        publicKey: this.publicKey,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      if (payload.tokenType !== 'refresh') {
        throw new UnauthorizedException('Token không phải là refresh token');
      }

      if (!payload.sub || !payload.userId || !payload.sid) {
        throw new UnauthorizedException('Refresh token thiếu thông tin định danh');
      }

      if (session) {
        const expectedSid = session.sid ?? session.id;
        const expectedSub = session.sub ?? session.accountId;
        const expectedUserId = session.userId;

        if (expectedSid !== undefined && payload.sid !== expectedSid) {
          throw new UnauthorizedException(
            'Refresh token không khớp với phiên làm việc (sid)',
          );
        }
        if (expectedSub !== undefined && payload.sub !== expectedSub) {
          throw new UnauthorizedException(
            'Refresh token không khớp với tài khoản (sub)',
          );
        }
        if (expectedUserId !== undefined && payload.userId !== expectedUserId) {
          throw new UnauthorizedException(
            'Refresh token không khớp với người dùng (userId)',
          );
        }
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
