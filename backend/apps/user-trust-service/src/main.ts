import { NestFactory } from '@nestjs/core';
import { UserTrustServiceModule } from './user-trust-service.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(UserTrustServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`User Trust Service running on port ${port}`);
}
await bootstrap();
