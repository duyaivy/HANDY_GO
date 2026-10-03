import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'node:crypto';
import {
  ACCESS_TOKEN_EXPIRATION_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
  REFRESH_TOKEN_EXPIRATION_DAYS,
} from './auth.constants.js';
import type { JwtPayload } from './auth.types.js';
import { resolvePrivateKey, resolvePublicKey } from './key-resolver.util.js';

@Injectable()
export class TokenSignerService {
  private readonly privateKey: string;

  constructor(private readonly jwtService: JwtService) {
    this.privateKey = resolvePrivateKey();
    this.validateKey();
  }

  private validateKey(): void {
    try {
      const privKeyObj = crypto.createPrivateKey(this.privateKey);
      if (privKeyObj.asymmetricKeyType !== 'rsa') {
        throw new Error(
          `Khóa riêng tư JWT phải có định dạng RSA (nhận được: ${privKeyObj.asymmetricKeyType})`,
        );
      }

      // Check key pair consistency with public key
      const derivedPublicKeyPem = crypto
        .createPublicKey(this.privateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString()
        .trim();

      const configuredPublicKey = resolvePublicKey().trim();
      const configuredPublicKeyPem = crypto
        .createPublicKey(configuredPublicKey)
        .export({ type: 'spki', format: 'pem' })
        .toString()
        .trim();

      if (derivedPublicKeyPem !== configuredPublicKeyPem) {
        throw new Error(
          'Cặp khóa JWT không khớp: Private Key và Public Key không tương ứng.',
        );
      }

      // Cryptographic sign & verify test
      const testData = Buffer.from('jwt-keypair-startup-check');
      const sign = crypto.createSign('SHA256');
      sign.update(testData);
      const signature = sign.sign(this.privateKey);

      const verify = crypto.createVerify('SHA256');
      verify.update(testData);
      if (!verify.verify(configuredPublicKeyPem, signature)) {
        throw new Error('Chữ ký kiểm thử thất bại với cặp khóa được cấu hình.');
      }
    } catch (err: any) {
      throw new Error(`Khóa riêng tư JWT không hợp lệ hoặc không khớp: ${err.message}`);
    }
  }

  async signAccessToken(params: {
    accountId: string;
    userId: string;
    sessionId: string;
    roles: string[];
    permissions: string[];
  }): Promise<{ token: string; expiresIn: number; jti: string }> {
    if (!this.privateKey) {
      throw new UnauthorizedException(
        'Không tìm thấy JWT private key để ký access token.',
      );
    }
    const jti = crypto.randomUUID();
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: params.accountId,
      userId: params.userId,
      sid: params.sessionId,
      roles: params.roles,
      permissions: params.permissions,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      jti,
    };

    const token = await this.jwtService.signAsync(payload, {
      algorithm: 'RS256',
      privateKey: this.privateKey,
      expiresIn: ACCESS_TOKEN_EXPIRATION_SECONDS,
    });

    return {
      token,
      expiresIn: ACCESS_TOKEN_EXPIRATION_SECONDS,
      jti,
    };
  }

  async signRefreshToken(params: {
    accountId: string;
    userId: string;
    sessionId: string;
  }): Promise<string> {
    if (!this.privateKey) {
      throw new UnauthorizedException(
        'Không tìm thấy JWT private key để ký refresh token.',
      );
    }
    const jti = crypto.randomUUID();
    const payload = {
      sub: params.accountId,
      userId: params.userId,
      sid: params.sessionId,
      tokenType: 'refresh',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      jti,
    };

    return this.jwtService.signAsync(payload, {
      algorithm: 'RS256',
      privateKey: this.privateKey,
      expiresIn: `${REFRESH_TOKEN_EXPIRATION_DAYS}d`,
    });
  }

  generateRefreshToken(params?: {
    accountId?: string;
    userId?: string;
    sessionId?: string;
  }): string {
    if (!this.privateKey) {
      return crypto.randomBytes(32).toString('hex');
    }
    const jti = crypto.randomUUID();
    const payload = {
      sub: params?.accountId || 'refresh-account',
      userId: params?.userId || 'refresh-user',
      sid: params?.sessionId || crypto.randomUUID(),
      tokenType: 'refresh',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      jti,
    };

    return this.jwtService.sign(payload, {
      algorithm: 'RS256',
      privateKey: this.privateKey,
      expiresIn: `${REFRESH_TOKEN_EXPIRATION_DAYS}d`,
    });
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

