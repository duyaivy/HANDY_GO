import { ApiClient } from '@/services/api/api-client';

export type AuthUser = {
  id: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: string[];
};

export type RegisterPayload = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  role?: 'Customer' | 'Worker';
};

export type RegisterResult = {
  userId: string;
  phone: string;
  email: string;
  verificationInstructions: string;
  emailMasked?: string;
  resendAvailableAt?: string;
  expiresAt?: string;
};

export type VerifyOtpPayload = {
  email?: string;
  phone?: string;
  otp: string;
};

export type ResendOtpPayload = {
  email?: string;
  phone?: string;
};

export type ResendOtpResult = {
  resendAvailableAt: string;
  expiresAt?: string;
};

export type LoginPayload = {
  phone: string;
  password: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthSessionData = {
  user: AuthUser;
} & AuthTokens;

export type ApiResponse<T> = {
  statusCode: number;
  message: string;
  data: T;
};

export const AuthApi = {
  register: async (payload: RegisterPayload): Promise<ApiResponse<RegisterResult>> => {
    return ApiClient.post<ApiResponse<RegisterResult>>('/auth/register', payload);
  },

  verifyOtp: async (payload: VerifyOtpPayload): Promise<ApiResponse<AuthSessionData>> => {
    return ApiClient.post<ApiResponse<AuthSessionData>>('/auth/verify-email', payload);
  },

  resendOtp: async (payload: ResendOtpPayload): Promise<ApiResponse<ResendOtpResult>> => {
    return ApiClient.post<ApiResponse<ResendOtpResult>>('/auth/resend-otp', payload);
  },

  login: async (payload: LoginPayload): Promise<ApiResponse<AuthSessionData>> => {
    return ApiClient.post<ApiResponse<AuthSessionData>>('/auth/login', payload);
  },

  refresh: async (refreshToken: string): Promise<ApiResponse<AuthTokens>> => {
    return ApiClient.post<ApiResponse<AuthTokens>>('/auth/refresh', { refreshToken });
  },

  logout: async (refreshToken?: string): Promise<ApiResponse<void>> => {
    return ApiClient.post<ApiResponse<void>>('/auth/logout', { refreshToken });
  },

  getMe: async (): Promise<ApiResponse<AuthUser>> => {
    return ApiClient.get<ApiResponse<AuthUser>>('/auth/me');
  },

  getMyProfile: async (): Promise<ApiResponse<any>> => {
    return ApiClient.get<ApiResponse<any>>('/users/me');
  },
};
