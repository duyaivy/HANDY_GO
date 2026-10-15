import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { LoggerModule } from '@app/logger';
import { ConfigModule } from '@app/config';
import { RabbitMQModule } from '@app/rabbitmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { CatalogCommonModule } from './common/catalog-common.module.js';
import { AuthModule } from '@app/auth';
import { RedisModule } from '@app/redis';
import { CategoriesModule } from './categories/categories.module.js';
import { ServicesModule } from './services/services.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ serviceName: 'catalog-service', defaultPort: 3003 }),
    LoggerModule.forRoot('catalog-service'),
    HealthModule,
    RabbitMQModule,
    PrismaModule,
    CatalogCommonModule,
    CategoriesModule,
    ServicesModule,
    AuthModule,
    RedisModule,
  ],
  controllers: [],
  providers: [],
})
export class CatalogServiceModule {}
