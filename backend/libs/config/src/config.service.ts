import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly config: NestConfigService) {}

  get serviceName(): string {
    return this.config.getOrThrow<string>('SERVICE_NAME');
  }

  get port(): number {
    return Number(this.config.getOrThrow<string>('PORT'));
  }

  get apiPrefix(): string {
    return this.config.getOrThrow<string>('API_PREFIX');
  }

  get corsOrigins(): string[] {
    return this.config
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get upstreamTimeoutMs(): number {
    return Number(this.config.getOrThrow<string>('UPSTREAM_TIMEOUT_MS'));
  }

  get otpSecret(): string {
    const secret = this.config.get<string>('OTP_SECRET');
    if (!secret || secret.trim().length === 0) {
      throw new Error('OTP_SECRET environment variable is required');
    }
    return secret;
  }

  get otpExpirationMinutes(): number {
    const val = this.config.get<string>('OTP_EXPIRATION_MINUTES');
    return val ? Number(val) : 10;
  }

  get otpResendCooldownSeconds(): number {
    const val = this.config.get<string>('OTP_RESEND_COOLDOWN_SECONDS');
    return val ? Number(val) : 60;
  }

  get otpMaxAttempts(): number {
    const val = this.config.get<string>('OTP_MAX_ATTEMPTS');
    return val ? Number(val) : 5;
  }

  get internalServiceSecret(): string {
    return this.config.get<string>('INTERNAL_SERVICE_SECRET') || '';
  }

  get smtpHost(): string {
    return this.config.get<string>('SMTP_HOST') || 'localhost';
  }

  get smtpPort(): number {
    return Number(this.config.get<string>('SMTP_PORT') || 1025);
  }

  get smtpSecure(): boolean {
    return this.config.get<string>('SMTP_SECURE') === 'true';
  }

  get smtpFrom(): string {
    return this.config.get<string>('SMTP_FROM') || 'HANDY GO <noreply@handygo.vn>';
  }

  get smtpUser(): string | undefined {
    return this.config.get<string>('SMTP_USER') || undefined;
  }

  get smtpPass(): string | undefined {
    return this.config.get<string>('SMTP_PASS') || undefined;
  }

  get cloudinaryCloudName(): string {
    return this.config.get<string>('CLOUDINARY_CLOUD_NAME') || '';
  }

  get cloudinaryApiKey(): string {
    return this.config.get<string>('CLOUDINARY_API_KEY') || '';
  }

  get cloudinaryApiSecret(): string {
    return this.config.get<string>('CLOUDINARY_API_SECRET') || '';
  }

  get cloudinaryImageFolder(): string {
    return this.config.get<string>('CLOUDINARY_IMAGE_FOLDER') || 'handy-go/images';
  }

  get cloudinaryVideoFolder(): string {
    return this.config.get<string>('CLOUDINARY_VIDEO_FOLDER') || 'handy-go/videos';
  }

  get cloudinaryImageMaxSizeMb(): number {
    const val = this.config.get<string>('CLOUDINARY_IMAGE_MAX_SIZE_MB');
    return val ? Number(val) : 10;
  }

  get cloudinaryVideoMaxSizeMb(): number {
    const val = this.config.get<string>('CLOUDINARY_VIDEO_MAX_SIZE_MB');
    return val ? Number(val) : 2048;
  }

  get cloudinaryVideoChunkSizeMb(): number {
    const val = this.config.get<string>('CLOUDINARY_VIDEO_CHUNK_SIZE_MB');
    return val ? Number(val) : 20;
  }

  getUrl(key: string): string {
    return this.config.getOrThrow<string>(key);
  }

  get(key: string): string | undefined {
    return this.config.get<string>(key);
  }

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV') || 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}


