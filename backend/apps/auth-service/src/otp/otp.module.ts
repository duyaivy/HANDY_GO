import { Module } from '@nestjs/common';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';
import { OtpFlowService } from './otp-flow.service.js';
import { PasswordResetFlowService } from './password-reset-flow.service.js';
import {
  PasswordResetRepository,
  PASSWORD_RESET_REPOSITORY,
} from './repositories/password-reset.repository.js';
import {
  BcryptPasswordHasher,
  PASSWORD_HASHER,
} from '../common/security/password-hasher.js';
import {
  ResetTokenService,
  RESET_TOKEN_SERVICE,
} from './services/reset-token.service.js';
import {
  PasswordResetEmailDispatcher,
  PASSWORD_RESET_EMAIL_DISPATCHER,
} from './services/password-reset-email.dispatcher.js';

@Module({
  controllers: [OtpController],
  providers: [
    OtpService,
    OtpFlowService,
    PasswordResetFlowService,
    PasswordResetRepository,
    {
      provide: PASSWORD_RESET_REPOSITORY,
      useClass: PasswordResetRepository,
    },
    BcryptPasswordHasher,
    {
      provide: PASSWORD_HASHER,
      useClass: BcryptPasswordHasher,
    },
    ResetTokenService,
    {
      provide: RESET_TOKEN_SERVICE,
      useClass: ResetTokenService,
    },
    PasswordResetEmailDispatcher,
    {
      provide: PASSWORD_RESET_EMAIL_DISPATCHER,
      useClass: PasswordResetEmailDispatcher,
    },
  ],
  exports: [
    OtpService,
    OtpFlowService,
    PasswordResetFlowService,
    PasswordResetRepository,
    PASSWORD_RESET_REPOSITORY,
    BcryptPasswordHasher,
    PASSWORD_HASHER,
    ResetTokenService,
    RESET_TOKEN_SERVICE,
    PasswordResetEmailDispatcher,
    PASSWORD_RESET_EMAIL_DISPATCHER,
  ],
})
export class OtpModule {}
