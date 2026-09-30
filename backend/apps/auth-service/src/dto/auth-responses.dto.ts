export interface UserSummaryDto {
  id: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: string[];
}

export interface RegisterResponseData {
  userId: string;
  phone: string;
  email: string;
  emailMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
  verificationInstructions: string;
}

export interface RegisterResponse {
  statusCode: number;
  message: string;
  data: RegisterResponseData;
}

export interface AuthSuccessData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserSummaryDto;
}

export interface AuthSuccessResponse {
  statusCode: number;
  message: string;
  data: AuthSuccessData;
}

export interface ResendOtpData {
  expiresAt: string;
  resendAvailableAt: string;
  emailMasked: string;
}

export interface ResendOtpResponse {
  statusCode: number;
  message: string;
  data: ResendOtpData;
}

export interface LogoutResponse {
  statusCode: number;
  message: string;
  data: null;
}

export interface MeResponseData {
  id: string;
  phone: string | null;
  email: string | null;
  isVerified: boolean;
  status: string;
  roles: string[];
  permissions: string[];
  createdAt: Date;
}

export interface MeResponse {
  statusCode: number;
  message: string;
  data: MeResponseData;
}
