import { Module } from '@nestjs/common';
import { CatalogServiceController } from './catalog-service.controller.js';
import { CatalogServiceService } from './catalog-service.service.js';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { ServicesModule } from './services/services.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'catalog-service', defaultPort: 3003 }),
    LoggerModule.forRoot('catalog-service'),
    HealthModule,
    RabbitMQModule,
    PrismaModule,
    CategoriesModule,
    ServicesModule,
  ],
  controllers: [CatalogServiceController],
  providers: [CatalogServiceService],
})
export class CatalogServiceModule {}
