import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TokenVerifierService } from './token-verifier.service.js';
import { TokenSignerService } from './token-signer.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    TokenVerifierService,
    JwtAuthGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [
    TokenVerifierService,
    JwtAuthGuard,
    PermissionsGuard,
    JwtModule,
  ],
})
export class AuthModule {}

@Module({
  imports: [JwtModule.register({})],
  providers: [TokenSignerService],
  exports: [TokenSignerService],
})
export class AuthSignerModule {}

