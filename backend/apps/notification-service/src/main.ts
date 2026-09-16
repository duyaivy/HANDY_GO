import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`Notification Service running on port ${port}`);
}
await bootstrap();
