import {
  type INestApplication,
  RequestMethod,
  type Type,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@app/config';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';
import { AppException, ERROR_CODES } from './errors/app-error.js';

export interface BootstrapOptions {
  connectMicroservices?: (app: INestApplication) => void | Promise<void>;
  setupApp?: (app: INestApplication) => void | Promise<void>;
}

export type SetupAppCallback = (app: INestApplication) => Promise<void> | void;

export async function bootstrapApplication(
  rootModule: Type<unknown>,
  optionsOrSetup?: BootstrapOptions | SetupAppCallback,
): Promise<void> {
  const app = await NestFactory.create(rootModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (validationErrors) => {
        const fieldErrors: Record<string, string[]> = {};
        for (const err of validationErrors) {
          if (err.constraints) {
            fieldErrors[err.property] = Object.values(err.constraints);
          }
        }
        return new AppException(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Dữ liệu yêu cầu không hợp lệ',
          { fieldErrors },
        );
      },
    }),
  );

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
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'docs', method: RequestMethod.GET },
    ],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${config.serviceName} API`)
    .setDescription(`API documentation for ${config.serviceName}`)
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  if (typeof optionsOrSetup === 'function') {
    await optionsOrSetup(app);
  } else if (optionsOrSetup) {
    if (optionsOrSetup.setupApp) {
      await optionsOrSetup.setupApp(app);
    }
    if (optionsOrSetup.connectMicroservices) {
      await optionsOrSetup.connectMicroservices(app);
      await app.startAllMicroservices();
      logger.log(`Microservices started for ${config.serviceName}`);
    }
  }

  await app.listen(config.port);
  logger.log(`${config.serviceName} listening on port ${config.port}`);
}
