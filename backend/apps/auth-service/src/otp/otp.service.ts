import { Injectable, Logger } from '@nestjs/common';
import crypto from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { ConfigService } from '@app/config';
import { buildOtpEmailHtml } from './templates/otp-email.template.js';

export interface GeneratedOtp {
  code: string;
  hash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  public static readonly DEFAULT_EXPIRATION_MINUTES = 10;
  public static readonly DEFAULT_RESEND_COOLDOWN_SECONDS = 60;
  public static readonly DEFAULT_MAX_ATTEMPTS = 5;

  public static readonly EXPIRATION_MINUTES = OtpService.DEFAULT_EXPIRATION_MINUTES;
  public static readonly RESEND_COOLDOWN_SECONDS = OtpService.DEFAULT_RESEND_COOLDOWN_SECONDS;
  public static readonly MAX_ATTEMPTS = OtpService.DEFAULT_MAX_ATTEMPTS;

  public readonly expirationMinutes: number;
  public readonly resendCooldownSeconds: number;
  public readonly maxAttempts: number;

  private transporter: Transporter | null = null;
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.otpSecret;
    if (!this.secret || this.secret.trim().length === 0) {
      throw new Error('OTP_SECRET environment variable is required');
    }
    this.expirationMinutes =
      this.config.otpExpirationMinutes || OtpService.DEFAULT_EXPIRATION_MINUTES;
    this.resendCooldownSeconds =
      this.config.otpResendCooldownSeconds ||
      OtpService.DEFAULT_RESEND_COOLDOWN_SECONDS;
    this.maxAttempts =
      this.config.otpMaxAttempts || OtpService.DEFAULT_MAX_ATTEMPTS;

    this.initTransporter();
  }

  private initTransporter(): void {
    const host = this.config.smtpHost;
    const port = this.config.smtpPort;
    const secure = this.config.smtpSecure;

    const options: SMTPTransport.Options = {
      host,
      port,
      secure,
    };

    const user = this.config.smtpUser;
    const pass = this.config.smtpPass;
    if (user && pass) {
      options.auth = { user, pass };
    }

    this.transporter = nodemailer.createTransport(options);
  }

  generateOtp(): GeneratedOtp {
    const code = crypto.randomInt(100000, 1000000).toString();
    const hash = this.hashOtp(code);
    const now = new Date();

    const expiresAt = new Date(
      now.getTime() + this.expirationMinutes * 60 * 1000,
    );
    const resendAvailableAt = new Date(
      now.getTime() + this.resendCooldownSeconds * 1000,
    );

    return { code, hash, expiresAt, resendAvailableAt };
  }

  hashOtp(otp: string): string {
    return crypto.createHmac('sha256', this.secret).update(otp).digest('hex');
  }

  verifyOtpHash(plainOtp: string, expectedHash: string): boolean {
    const computedHash = this.hashOtp(plainOtp);
    if (computedHash.length !== expectedHash.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(expectedHash, 'hex'),
    );
  }

  async sendVerificationOtp(email: string, otpCode: string): Promise<void> {
    const from = this.config.smtpFrom;
    const maskedEmail = this.maskEmail(email);

    if (!this.transporter) {
      this.initTransporter();
    }

    try {
      await this.transporter!.sendMail({
        from,
        to: email,
        subject: `[HANDY GO] Mã xác thực tài khoản của bạn`,
        text: `Chào bạn, mã xác thực tài khoản HANDY GO của bạn là: ${otpCode}. Mã có hiệu lực trong ${this.expirationMinutes} phút. Nếu bạn không yêu cầu mã này, vui lòng bỏ qua.`,
        html: buildOtpEmailHtml(otpCode, this.expirationMinutes),
      });

      this.logger.log(`Verification OTP email sent to ${maskedEmail}`);
    } catch (error) {
      this.logger.error(
        `Failed to deliver OTP email to ${maskedEmail}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) return '***';
    if (name.length <= 2) {
      return `${name[0]}***@${domain}`;
    }
    return `${name[0]}***${name[name.length - 1]}@${domain}`;
  }
}
