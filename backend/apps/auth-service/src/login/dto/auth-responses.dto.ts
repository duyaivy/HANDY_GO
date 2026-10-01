export interface UserSummaryDto {
  id: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: string[];
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

export type { RegisterResponse, RegisterResponseData } from '../../register/dto/register-response.dto.js';
export type { ResendOtpResponse, ResendOtpData } from '../../otp/dto/otp-responses.dto.js';
