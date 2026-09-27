import { RequestMethod, ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@app/config';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';
import { AppException, ERROR_CODES } from './errors/app-error.js';

export interface BootstrapOptions {
  connectMicroservices?: (app: INestApplication) => void | Promise<void>;
}

export async function bootstrapApplication(
  rootModule: Type<unknown>,
  options?: BootstrapOptions,
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
  app.enableCors({ origin: config.corsOrigins });
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

  if (options?.connectMicroservices) {
    await options.connectMicroservices(app);
    await app.startAllMicroservices();
    logger.log(`Microservices started for ${config.serviceName}`);
  }

  await app.listen(config.port);
  logger.log(`${config.serviceName} listening on port ${config.port}`);
}
