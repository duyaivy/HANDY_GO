import { NestFactory } from '@nestjs/core';
import { CatalogServiceModule } from './catalog-service.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(CatalogServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`Catalog Service running on port ${port}`);
}
await bootstrap();
