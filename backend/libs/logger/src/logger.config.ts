import type { Params } from 'nestjs-pino';

export const createLoggerConfig = (): Params => ({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',

    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
            },
          }
        : undefined,
  },
});