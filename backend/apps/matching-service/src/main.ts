import { NestFactory } from '@nestjs/core';
import { MatchingServiceModule } from './matching-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(MatchingServiceModule);
  await app.listen(process.env.port ?? 3000);
}
await bootstrap();
