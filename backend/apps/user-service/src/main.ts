import { NestFactory } from '@nestjs/core';
import { UserServiceModule } from './user-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(UserServiceModule);
  await app.listen(process.env.port ?? 3000);
}
await bootstrap();
