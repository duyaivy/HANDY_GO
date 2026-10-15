import { Module } from '@nestjs/common';
import { RegisterController } from './register.controller.js';
import { RegisterFlowService } from './register-flow.service.js';
import { OtpModule } from '../otp/otp.module.js';

@Module({
  imports: [OtpModule],
  controllers: [RegisterController],
  providers: [RegisterFlowService],
  exports: [RegisterFlowService],
})
export class RegisterModule {}
