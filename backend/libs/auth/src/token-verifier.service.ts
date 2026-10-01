import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'node:crypto';
import { JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';
import type { JwtPayload } from './auth.types.js';
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
      return payload;
    } catch {
      throw new UnauthorizedException('Mã truy cập không hợp lệ hoặc đã hết hạn');
    }
  }

  async verifyRefreshToken(token: string): Promise<{
    sub: string;
    userId: string;
    sid: string;
    tokenType: string;
    jti: string;
  }> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        userId: string;
        sid: string;
        tokenType: string;
        jti: string;
      }>(token, {
        algorithms: ['RS256'],
        publicKey: this.publicKey,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (payload.tokenType !== 'refresh') {
        throw new UnauthorizedException('Token không phải là refresh token');
      }
      return payload;
    } catch {
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
