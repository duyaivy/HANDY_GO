import {
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';

@Injectable()
export class GatewayExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GatewayExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resObj = exceptionResponse as Record<string, unknown>;
        if (Array.isArray(resObj.message)) {
          message = resObj.message.join(', ');
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else if (typeof resObj.error === 'string') {
          message = resObj.error;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    const existingRequestId = request.headers['x-request-id'];
    const requestId =
      (Array.isArray(existingRequestId)
        ? existingRequestId[0]
        : existingRequestId) || crypto.randomUUID();

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
      requestId,
    });
  }
}
