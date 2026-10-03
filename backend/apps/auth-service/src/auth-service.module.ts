import { Module } from '@nestjs/common';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { AuthCommonModule } from './common/auth-common.module.js';
import { HealthModule } from './health/health.module.js';
import { RegisterModule } from './register/register.module.js';
import { OtpModule } from './otp/otp.module.js';
import { LoginModule } from './login/login.module.js';
import { AuthServiceService } from './auth-service.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'auth-service',
      defaultPort: 3001,
      requiredKeys: ['OTP_SECRET'],
    }),
    LoggerModule.forRoot('auth-service'),
    AuthCommonModule,
    HealthModule,
    OtpModule,
    RegisterModule,
    LoginModule,
  ],
  providers: [AuthServiceService],
  exports: [AuthServiceService],
})
export class AuthServiceModule {}
