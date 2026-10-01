export const REGISTER_IP_RATE_LIMIT = 10;
export const REGISTER_IP_WINDOW_SECONDS = 3600;

export const LOGIN_IP_RATE_LIMIT = 30;
export const LOGIN_IP_WINDOW_SECONDS = 60;

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const FAILED_LOGIN_LOCKOUT_SECONDS = 15 * 60;

export const RESEND_OTP_LIMIT = 5;
export const RESEND_OTP_WINDOW_SECONDS = 3600;

export const INTERNAL_GATEWAY_HEADER = 'x-internal-secret';
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const USER_AGENT_HEADER = 'user-agent';
