import { NestFactory } from '@nestjs/core';
import { OrderServiceModule } from './order-service.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(OrderServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`Order Service running on port ${port}`);
}
await bootstrap();
