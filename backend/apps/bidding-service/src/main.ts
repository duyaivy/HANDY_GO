import { NestFactory } from '@nestjs/core';
import { BiddingServiceModule } from './bidding-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(BiddingServiceModule);
  await app.listen(process.env.port ?? 3000);
}
await bootstrap();
