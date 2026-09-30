import {
  type INestApplication,
  RequestMethod,
  type Type,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { Logger } from 'nestjs-pino';

export interface BootstrapOptions {
  enableSwagger?: boolean;
  swaggerTitle?: string;
  swaggerDescription?: string;
  swaggerVersion?: string;
  swaggerPath?: string;
  configure?: (app: INestApplication) => Promise<void> | void;
}

export async function bootstrapApplication(
  rootModule: Type<unknown>,
  options?: BootstrapOptions,
): Promise<void> {
  const app = await NestFactory.create(rootModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.enableCors({ origin: config.corsOrigins });
  app.setGlobalPrefix(config.apiPrefix, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  if (options?.enableSwagger) {
    const swaggerDocConfig = new DocumentBuilder()
      .setTitle(options.swaggerTitle ?? `${config.serviceName} API`)
      .setDescription(
        options.swaggerDescription ??
          `API documentation for ${config.serviceName}`,
      )
      .setVersion(options.swaggerVersion ?? '1.0.0')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerDocConfig);
    const swaggerPath = options.swaggerPath ?? `${config.apiPrefix}/docs`;
    SwaggerModule.setup(swaggerPath, app, document);
    logger.log(`Swagger documentation configured at /${swaggerPath}`);
  }

  if (options?.configure) {
    await options.configure(app);
  }

  await app.listen(config.port);
  logger.log(`${config.serviceName} listening on port ${config.port}`);
}
