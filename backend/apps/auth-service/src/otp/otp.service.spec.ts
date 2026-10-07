import { describe, expect, it, beforeEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import type { ConfigService } from '@app/config';
import { OtpService } from './otp.service.js';

vi.mock('nodemailer', () => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'msg-123' });
  return {
    default: {
      createTransport: vi.fn(() => ({
        sendMail: sendMailMock,
      })),
    },
  };
});

describe('OtpService', () => {
  let service: OtpService;
  let mockConfig: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      otpSecret: 'test-otp-secret-key-1234567890',
      smtpHost: 'localhost',
      smtpPort: 1025,
      smtpSecure: false,
      smtpFrom: 'HANDY GO <noreply@handygo.vn>',
      smtpUser: undefined,
      smtpPass: undefined,
    } as unknown as ConfigService;
    service = new OtpService(mockConfig);
  });

  it('should throw an error on startup if OTP_SECRET is missing or empty', () => {
    const invalidConfig = {
      otpSecret: '',
    } as unknown as ConfigService;

    expect(() => new OtpService(invalidConfig)).toThrow(
      'OTP_SECRET environment variable is required',
    );
  });

  it('should generate a 6-digit OTP code with valid expiration and cooldown', () => {
    const generated = service.generateOtp();
    expect(generated.code).toMatch(/^\d{6}$/);
    expect(generated.hash).toBeDefined();
    expect(generated.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(generated.resendAvailableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should verify OTP hash correctly with constant-time equality', () => {
    const { code, hash } = service.generateOtp();
    expect(service.verifyOtpHash(code, hash)).toBe(true);
    expect(service.verifyOtpHash('000000', hash)).toBe(false);
  });

  it('should mask email addresses safely for logs and UI display', () => {
    expect(service.maskEmail('test@example.com')).toBe('t***t@example.com');
    expect(service.maskEmail('a@b.com')).toBe('a***@b.com');
  });

  it('should send email using SMTP transporter with correct payload from template', async () => {
    const transporter = (nodemailer.createTransport as any)();
    await service.sendVerificationOtp('test@example.com', '123456');

    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: expect.stringContaining('Mã xác thực'),
        text: expect.stringContaining('123456'),
        html: expect.stringContaining('123456'),
      }),
    );
  });

  it('should throw when SMTP delivery fails', async () => {
    const transporter = (nodemailer.createTransport as any)();
    transporter.sendMail.mockRejectedValueOnce(new Error('SMTP connection failure'));

    await expect(
      service.sendVerificationOtp('test@example.com', '123456'),
    ).rejects.toThrow('SMTP connection failure');
  });

  it('should use default values for expiration, cooldown, and max attempts when not configured', () => {
    expect(service.expirationMinutes).toBe(10);
    expect(service.resendCooldownSeconds).toBe(60);
    expect(service.maxAttempts).toBe(5);
  });

  it('should read custom OTP expiration, cooldown, and max attempts from config', () => {
    const customConfig = {
      otpSecret: 'test-otp-secret-key-1234567890',
      otpExpirationMinutes: 15,
      otpResendCooldownSeconds: 90,
      otpMaxAttempts: 3,
      smtpHost: 'localhost',
      smtpPort: 1025,
      smtpSecure: false,
      smtpFrom: 'HANDY GO <noreply@handygo.vn>',
    } as unknown as ConfigService;

    const customService = new OtpService(customConfig);
    expect(customService.expirationMinutes).toBe(15);
    expect(customService.resendCooldownSeconds).toBe(90);
    expect(customService.maxAttempts).toBe(3);

    const generated = customService.generateOtp();
    const expectedExpireMs = Date.now() + 15 * 60 * 1000;
    expect(Math.abs(generated.expiresAt.getTime() - expectedExpireMs)).toBeLessThan(2000);
  });

  it('should throw when Gmail host is used without credentials', () => {
    const gmailConfigWithoutCreds = {
      otpSecret: 'test-otp-secret-key-1234567890',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpFrom: 'HANDY GO <noreply@gmail.com>',
      smtpUser: undefined,
      smtpPass: undefined,
    } as unknown as ConfigService;

    expect(() => new OtpService(gmailConfigWithoutCreds)).toThrow(
      'Missing SMTP credentials: SMTP_USER and SMTP_PASS (App Password) are required when using Gmail SMTP.',
    );
  });

  it('should configure Gmail transport with SSL and auth when credentials are provided', () => {
    const gmailConfigWithCreds = {
      otpSecret: 'test-otp-secret-key-1234567890',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: false, // Should auto-enable secure for port 465
      smtpFrom: 'HANDY GO <myaccount@gmail.com>',
      smtpUser: 'myaccount@gmail.com',
      smtpPass: 'abcd efgh ijkl mnop',
    } as unknown as ConfigService;

    const gmailService = new OtpService(gmailConfigWithCreds);
    expect(gmailService).toBeDefined();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: 'myaccount@gmail.com',
          pass: 'abcd efgh ijkl mnop',
        },
      }),
    );
  });
});

