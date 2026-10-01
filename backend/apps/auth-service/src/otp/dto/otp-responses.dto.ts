export interface ResendOtpData {
  challengeId?: string;
  expiresAt: string;
  resendAvailableAt: string;
  emailMasked: string;
}

export interface ResendOtpResponse {
  statusCode: number;
  message: string;
  data: ResendOtpData;
}
