import { NestFactory } from '@nestjs/core';
import { PaymentServiceModule } from './payment-service.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(PaymentServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`Payment Service running on port ${port}`);
}
await bootstrap();
