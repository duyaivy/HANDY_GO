import {
  type INestApplication,
  RequestMethod,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@app/config';
import { Logger } from 'nestjs-pino';

export async function bootstrapApplication(
  rootModule: Type<unknown>,
  setupApp?: (app: INestApplication) => Promise<void> | void,
): Promise<void> {
  const app = await NestFactory.create(rootModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (such as mobile apps, curl, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      if (
        config.corsOrigins.includes('*') ||
        config.corsOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'x-client-platform',
      'Accept',
    ],
    maxAge: 86400,
  });

  app.setGlobalPrefix(config.apiPrefix, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  if (setupApp) {
    await setupApp(app);
  }

  await app.listen(config.port);
  logger.log(`${config.serviceName} listening on port ${config.port}`);
}

