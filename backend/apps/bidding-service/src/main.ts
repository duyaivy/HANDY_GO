import { NestFactory } from '@nestjs/core';
import { BiddingServiceModule } from './bidding-service.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(BiddingServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`Bidding Service running on port ${port}`);
}
await bootstrap();
