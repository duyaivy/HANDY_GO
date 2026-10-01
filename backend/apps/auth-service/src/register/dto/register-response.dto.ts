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

export interface RegisterResponse {
  statusCode: number;
  message: string;
  data: RegisterResponseData;
}
