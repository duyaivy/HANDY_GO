import { Injectable, Logger } from '@nestjs/common';
import crypto from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';

export interface GeneratedOtp {
  code: string;
  hash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  public static readonly EXPIRATION_MINUTES = 10;
  public static readonly RESEND_COOLDOWN_SECONDS = 60;
  public static readonly MAX_ATTEMPTS = 5;

  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST || 'localhost';
    const port = Number(process.env.SMTP_PORT || 1025);
    const secure = process.env.SMTP_SECURE === 'true';

    const options: Record<string, any> = {
      host,
      port,
      secure,
    };

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      (options as any).auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      };
    }

    this.transporter = nodemailer.createTransport(options);
  }

  generateOtp(): GeneratedOtp {
    const code = crypto.randomInt(100000, 1000000).toString();
    const hash = this.hashOtp(code);
    const now = new Date();

    const expiresAt = new Date(
      now.getTime() + OtpService.EXPIRATION_MINUTES * 60 * 1000,
    );
    const resendAvailableAt = new Date(
      now.getTime() + OtpService.RESEND_COOLDOWN_SECONDS * 1000,
    );

    return { code, hash, expiresAt, resendAvailableAt };
  }

  hashOtp(otp: string): string {
    const secret = process.env.OTP_SECRET || 'handy-go-server-side-otp-secret-key';
    return crypto.createHmac('sha256', secret).update(otp).digest('hex');
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
    const from = process.env.SMTP_FROM || 'HANDY GO <noreply@handygo.vn>';
    const maskedEmail = this.maskEmail(email);

    if (!this.transporter) {
      this.initTransporter();
    }

    try {
      await this.transporter!.sendMail({
        from,
        to: email,
        subject: `[HANDY GO] Mã xác thực tài khoản của bạn`,
        text: `Chào bạn, mã xác thực tài khoản HANDY GO của bạn là: ${otpCode}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, vui lòng bỏ qua.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: bold; font-size: 20px; width: 48px; height: 48px; line-height: 48px; border-radius: 10px;">HG</div>
              <h2 style="color: #111827; margin-top: 12px; margin-bottom: 4px; font-size: 22px;">Xác thực tài khoản HANDY GO</h2>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">Chào mừng bạn đến với nền tảng dịch vụ tiện ích HANDY GO</p>
            </div>
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
              <span style="display: block; font-size: 13px; color: #4b5563; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Mã xác thực (OTP)</span>
              <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e40af; font-family: monospace;">${otpCode}</span>
            </div>
            <p style="color: #374151; font-size: 14px; line-height: 1.5; margin-bottom: 8px;">
              Mã xác thực có hiệu lực trong vòng <strong>${OtpService.EXPIRATION_MINUTES} phút</strong>. Vui lòng nhập mã này vào ứng dụng để hoàn tất đăng ký.
            </p>
            <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f3f4f6; pt-4;">
              Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email. Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ tài khoản của bạn.
            </p>
          </div>
        `,
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
