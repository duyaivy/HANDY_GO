import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';
import { DashboardServicesController } from './dashboard-services.controller.js';
import { InternalServiceGuard } from './internal-service.guard.js';

@Module({
  controllers: [ServicesController, DashboardServicesController],
  providers: [ServicesService, InternalServiceGuard],
  exports: [ServicesService],
})
export class ServicesModule {}
