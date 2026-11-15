import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { optionalValue } from './optional-env.js';

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
    const secret = this.get('OTP_SECRET');
    if (!secret || secret.trim().length === 0) {
      throw new Error('OTP_SECRET environment variable is required');
    }
    return secret;
  }

  get otpExpirationMinutes(): number {
    const val = this.get('OTP_EXPIRATION_MINUTES');
    return val ? Number(val) : 10;
  }

  get otpResendCooldownSeconds(): number {
    const val = this.get('OTP_RESEND_COOLDOWN_SECONDS');
    return val ? Number(val) : 60;
  }

  get otpMaxAttempts(): number {
    const val = this.get('OTP_MAX_ATTEMPTS');
    return val ? Number(val) : 5;
  }

  get internalServiceSecret(): string {
    return this.get('INTERNAL_SERVICE_SECRET') || '';
  }

  get smtpHost(): string {
    return this.get('SMTP_HOST') || 'smtp.gmail.com';
  }

  get smtpPort(): number {
    return Number(this.get('SMTP_PORT') || 465);
  }

  get smtpSecure(): boolean {
    return this.get('SMTP_SECURE') === 'true';
  }

  get smtpFrom(): string {
    return this.get('SMTP_FROM') || 'HANDY GO <noreply@handygo.vn>';
  }

  get smtpUser(): string | undefined {
    return this.get('SMTP_USER') || undefined;
  }

  get smtpPass(): string | undefined {
    return this.get('SMTP_PASS') || undefined;
  }

  get cloudinaryCloudName(): string {
    return this.get('CLOUDINARY_CLOUD_NAME') || '';
  }

  get cloudinaryApiKey(): string {
    return this.get('CLOUDINARY_API_KEY') || '';
  }

  get cloudinaryApiSecret(): string {
    return this.get('CLOUDINARY_API_SECRET') || '';
  }

  get cloudinaryImageFolder(): string {
    return this.get('CLOUDINARY_IMAGE_FOLDER') || 'handy-go/images';
  }

  get cloudinaryVideoFolder(): string {
    return this.get('CLOUDINARY_VIDEO_FOLDER') || 'handy-go/videos';
  }

  get cloudinaryImageMaxSizeMb(): number {
    const val = this.get('CLOUDINARY_IMAGE_MAX_SIZE_MB');
    return val ? Number(val) : 10;
  }

  get cloudinaryVideoMaxSizeMb(): number {
    const val = this.get('CLOUDINARY_VIDEO_MAX_SIZE_MB');
    return val ? Number(val) : 2048;
  }

  get cloudinaryVideoChunkSizeMb(): number {
    const val = this.get('CLOUDINARY_VIDEO_CHUNK_SIZE_MB');
    return val ? Number(val) : 20;
  }

  getUrl(key: string): string {
    return this.config.getOrThrow<string>(key);
  }

  get messageServiceUrl(): string {
    return this.getUrl('MESSAGE_SERVICE_URL');
  }

  get(key: string): string | undefined {
    return optionalValue(this.config.get<string>(key));
  }

  get nodeEnv(): string {
    return this.get('NODE_ENV') || 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get redisUrl(): string {
    return this.get('REDIS_URL') || 'redis://localhost:6379';
  }
}


