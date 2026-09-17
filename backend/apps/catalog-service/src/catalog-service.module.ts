import { Module } from '@nestjs/common';
import { CatalogServiceController } from './catalog-service.controller.js';
import { CatalogServiceService } from './catalog-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'catalog-service', defaultPort: 3003 }),
    LoggerModule.forRoot('catalog-service'),
    HealthModule,
  ],
  controllers: [CatalogServiceController],
  providers: [CatalogServiceService],
})
export class CatalogServiceModule {}
