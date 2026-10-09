import type { ApiResponseEnvelope } from '@app/common';

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

export type AuthSuccessResponse = ApiResponseEnvelope<AuthSuccessData>;

export type LogoutResponse = ApiResponseEnvelope<null>;

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

export type MeResponse = ApiResponseEnvelope<MeResponseData>;
