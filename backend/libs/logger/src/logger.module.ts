import { DynamicModule, Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { createLoggerConfig } from './logger.config.js';

@Global()
@Module({})
export class LoggerModule {
  static forRoot(serviceName: string): DynamicModule {
    return {
      module: LoggerModule,
      imports: [PinoLoggerModule.forRoot(createLoggerConfig(serviceName))],
      exports: [PinoLoggerModule],
    };
  }
}
