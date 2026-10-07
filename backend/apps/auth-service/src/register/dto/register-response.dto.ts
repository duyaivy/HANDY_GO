import type { ApiResponseEnvelope } from '@app/common';

export interface RegisterResponseData {
  challengeId?: string;
  userId: string;
  phone: string;
  email: string;
  emailMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
  verificationInstructions: string;
}

export type RegisterResponse = ApiResponseEnvelope<RegisterResponseData>;
