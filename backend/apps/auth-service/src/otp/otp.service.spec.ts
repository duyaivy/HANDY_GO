import { describe, expect, it, beforeEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
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

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OtpService();
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

  it('should send email using SMTP transporter with correct payload', async () => {
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
});
