export interface OtpEmailTemplateOptions {
  otpCode: string;
  expirationMinutes?: number;
}

export function buildOtpEmailHtml(
  otpCode: string,
  expirationMinutes = 10,
): string {
  return `
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
        Mã xác thực có hiệu lực trong vòng <strong>${expirationMinutes} phút</strong>. Vui lòng nhập mã này vào ứng dụng để hoàn tất đăng ký.
      </p>
      <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
        Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email. Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ tài khoản của bạn.
      </p>
    </div>
  `.trim();
}
