import 'reflect-metadata';
import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { MessageModule } from './message.module.js';
import type { MessageAppOptions } from './message.options.js';
import { MessageRuntimeService } from './message-runtime.service.js';

export type { MessageAppOptions } from './message.options.js';

export async function createMessageApp(options: MessageAppOptions) {
  let app: NestExpressApplication | undefined;
  try {
    app = await NestFactory.create<NestExpressApplication>(
      MessageModule.register(options),
      {
        bufferLogs: true,
        bodyParser: false,
        abortOnError: false,
      },
    );
    app.useLogger(app.get(Logger));
    app.useBodyParser('json', { limit: '16kb', strict: true });
    app.enableShutdownHooks();
    app.enableCors({ origin: options.origins, credentials: true });
    // Preserve factory-before-init startup. Imported modules use onModuleInit.
    await app.get(MessageRuntimeService).start();
    return app;
  } catch (error) {
    try {
      if (app) await app.close();
      else await options.db.$disconnect();
    } catch {
      new NestLogger('MessageApplication').error({
        errorCode: 'MESSAGE_SETUP_CLEANUP_FAILED',
      });
    }
    throw error;
  }
}
