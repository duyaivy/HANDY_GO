import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`API Gateway running on port ${port}`);
}
await bootstrap();





