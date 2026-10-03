import { renderEmailTemplate } from '@app/common';

export interface OtpEmailTemplateOptions {
  otpCode: string;
  expirationMinutes?: number;
}

export function buildOtpEmailHtml(
  otpCode: string,
  expirationMinutes = 10,
): string {
  const content = `
    <span style="display: block; font-size: 13px; color: #4b5563; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Mã xác thực (OTP)</span>
    <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e40af; font-family: monospace;">${otpCode}</span>
  `.trim();

  return renderEmailTemplate('template.html', {
    title: 'Xác thực tài khoản HANDY GO',
    description: 'Chào mừng bạn đến với nền tảng dịch vụ tiện ích HANDY GO',
    content,
    note: `Mã xác thực có hiệu lực trong vòng <strong>${expirationMinutes} phút</strong>. Vui lòng nhập mã này vào ứng dụng để hoàn tất đăng ký.`,
    footer:
      'Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email. Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ tài khoản của bạn.',
  });
}
