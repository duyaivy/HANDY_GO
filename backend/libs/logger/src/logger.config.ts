import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

export const createLoggerConfig = (
  serviceName = 'unknown-service',
): Params => ({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    name: serviceName,
    genReqId(request, response) {
      const incomingId = request.headers['x-request-id'];
      const requestId =
        typeof incomingId === 'string' && incomingId.length > 0
          ? incomingId
          : randomUUID();
      response.setHeader('x-request-id', requestId);
      return requestId;
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        '*.password',
        '*.token',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },

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
