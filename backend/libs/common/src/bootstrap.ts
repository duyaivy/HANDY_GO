import { RequestMethod, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@app/config';
import { Logger } from 'nestjs-pino';

export async function bootstrapApplication(
  rootModule: Type<unknown>,
): Promise<void> {
  const app = await NestFactory.create(rootModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.enableCors({ origin: config.corsOrigins });
  app.setGlobalPrefix(config.apiPrefix, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  await app.listen(config.port);
  logger.log(`${config.serviceName} listening on port ${config.port}`);
}
