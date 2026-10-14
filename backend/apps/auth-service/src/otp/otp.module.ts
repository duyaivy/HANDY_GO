import { Module } from '@nestjs/common';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';
import { OtpFlowService } from './otp-flow.service.js';
import { PasswordResetFlowService } from './password-reset-flow.service.js';

@Module({
  controllers: [OtpController],
  providers: [OtpService, OtpFlowService, PasswordResetFlowService],
  exports: [OtpService, OtpFlowService, PasswordResetFlowService],
})
export class OtpModule {}
