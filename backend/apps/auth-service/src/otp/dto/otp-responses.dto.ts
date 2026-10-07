import type { ApiResponseEnvelope } from '@app/common';

export interface ResendOtpData {
  challengeId?: string;
  expiresAt: string;
  resendAvailableAt: string;
  emailMasked: string;
}

export type ResendOtpResponse = ApiResponseEnvelope<ResendOtpData>;
