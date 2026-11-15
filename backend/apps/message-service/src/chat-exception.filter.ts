import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatError, publicError } from './security.js';
@Catch()
export class ChatExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const e =
      (error as { type?: string })?.type === 'entity.too.large'
        ? new ChatError('PAYLOAD_TOO_LARGE')
        : publicError(error);
    if (e.retryAfterMs)
      response.setHeader('Retry-After', Math.ceil(e.retryAfterMs / 1000));
    response.status(e.status).json({
      statusCode: e.status,
      message: e.code,
      data: null,
      code: e.code,
    });
  }
}
