import { Module } from '@nestjs/common';
import { CatalogServiceController } from './catalog-service.controller.js';
import { CatalogServiceService } from './catalog-service.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';

@Module({
  imports: [HealthModule, LoggerModule],
  controllers: [CatalogServiceController, HealthController],
  providers: [CatalogServiceService],
})
export class CatalogServiceModule {}
