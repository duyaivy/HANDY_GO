import { Module } from '@nestjs/common';
import { LoginController } from './login.controller.js';
import { LoginFlowService } from './login-flow.service.js';
import { OtpModule } from '../otp/otp.module.js';

@Module({
  imports: [OtpModule],
  controllers: [LoginController],
  providers: [LoginFlowService],
  exports: [LoginFlowService],
})
export class LoginModule {}
