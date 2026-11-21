import { Module } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, TrustedGatewayGuard, AdminGuard],
})
export class DashboardModule {}
