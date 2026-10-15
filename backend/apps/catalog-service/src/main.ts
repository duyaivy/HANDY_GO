import { CatalogServiceModule } from './catalog-service.module.js';
import { bootstrapApplication } from '@app/common';

await bootstrapApplication(CatalogServiceModule, {
  enableSwagger: true,
  swaggerTitle: 'HandyGo Catalog Service API',
  swaggerDescription:
    'REST APIs for HandyGo Catalog Service managing service categories and services hierarchy',
  swaggerVersion: '1.0.0',
});
