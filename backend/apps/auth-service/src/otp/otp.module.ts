import { Module } from '@nestjs/common';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';
import { OtpFlowService } from './otp-flow.service.js';

@Module({
  controllers: [OtpController],
  providers: [OtpService, OtpFlowService],
  exports: [OtpService, OtpFlowService],
})
export class OtpModule {}
