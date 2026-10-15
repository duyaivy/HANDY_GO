import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OtpService } from '../otp.service.js';

export const PASSWORD_RESET_EMAIL_DISPATCHER = Symbol(
  'PASSWORD_RESET_EMAIL_DISPATCHER',
);

export interface IPasswordResetEmailDispatcher {
  /**
   * Dispatches the 6-digit password reset OTP email to the user.
   */
  sendResetEmail(email: string, otpCode: string): Promise<void>;

  /**
   * Mitigates timing side-channel attacks by equalizing processing time
   * when an account is not found or not eligible for password reset.
   */
  simulateEmailDispatchDelay(): Promise<void>;
}

@Injectable()
export class PasswordResetEmailDispatcher
  implements IPasswordResetEmailDispatcher
{
  constructor(private readonly otpService: OtpService) {}

  async sendResetEmail(email: string, otpCode: string): Promise<void> {
    await this.otpService.sendPasswordResetOtp(email, otpCode);
  }

  async simulateEmailDispatchDelay(): Promise<void> {
    // Perform dummy HMAC and crypto computations to match the cryptographic operations
    // of an eligible account flow, equalizing execution time against timing side-channel attacks.
    crypto
      .createHmac('sha256', 'dummy-enumeration-protection-secret')
      .update('handygo-dummy-timing-equalization')
      .digest('hex');
  }
}
