import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TokenVerifierService } from './token-verifier.service.js';
import { TokenSignerService } from './token-signer.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

/**
 * Global authentication and authorization module for the Handy Go platform.
 *
 * IMPORTANT ARCHITECTURAL NOTE ON GLOBAL GUARDS:
 * This module registers `JwtAuthGuard` and `PermissionsGuard` as global `APP_GUARD` providers.
 * Any microservice or gateway that imports `AuthModule` will automatically have ALL of its HTTP
 * routes protected by default:
 *
 * 1. `JwtAuthGuard`:
 *    - Rejects unauthenticated requests with 401 Unauthorized unless the route or controller
 *      is explicitly marked with `@Public()`.
 *    - Populates `req.user` with the validated JWT access token payload.
 *
 * 2. `PermissionsGuard`:
 *    - Denies access by default if a protected route does not declare required permissions.
 *    - Checks that the user's permissions contain all permissions required by `@RequirePermissions(...)`.
 *    - Bypassed for routes marked `@Public()`.
 *
 * DO NOT declare `@UseGuards(JwtAuthGuard, PermissionsGuard)` on individual controllers or route
 * handlers when `AuthModule` is imported, as doing so is redundant and causes the guards to execute twice.
 */
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

