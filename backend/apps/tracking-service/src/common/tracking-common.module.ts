import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { TrustedGatewayGuard } from './security/trusted-gateway.guard.js';

@Global()
@Module({
  providers: [PrismaService, TrustedGatewayGuard],
  exports: [PrismaService, TrustedGatewayGuard],
})
export class TrackingCommonModule {}
