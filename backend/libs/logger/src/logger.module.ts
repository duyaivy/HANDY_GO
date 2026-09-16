import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { createLoggerConfig } from './logger.config.js';

@Global()
@Module({
  imports: [PinoLoggerModule.forRoot(createLoggerConfig())],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}