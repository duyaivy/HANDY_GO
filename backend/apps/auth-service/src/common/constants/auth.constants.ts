export const REGISTER_IP_RATE_LIMIT = 10;
export const REGISTER_IP_WINDOW_SECONDS = 3600;

export const LOGIN_IP_RATE_LIMIT = 30;
export const LOGIN_IP_WINDOW_SECONDS = 60;

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const FAILED_LOGIN_LOCKOUT_SECONDS = 15 * 60;

export const RESEND_OTP_LIMIT = 5;
export const RESEND_OTP_WINDOW_SECONDS = 3600;

export const FORGOT_PASSWORD_EMAIL_LIMIT = 5;
export const FORGOT_PASSWORD_IP_LIMIT = 10;
export const FORGOT_PASSWORD_WINDOW_SECONDS = 3600;

export const VERIFY_RESET_OTP_IP_LIMIT = 10;
export const VERIFY_RESET_OTP_WINDOW_SECONDS = 3600;
export const RESET_TOKEN_EXPIRES_IN_SECONDS = 900;
export const PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS = RESET_TOKEN_EXPIRES_IN_SECONDS;
export const DEFAULT_VERIFY_RESET_OTP_MESSAGE =
  'Xác thực mã OTP thành công. Vui lòng đặt lại mật khẩu mới.';

export const INTERNAL_GATEWAY_HEADER = 'x-internal-secret';
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const USER_AGENT_HEADER = 'user-agent';

