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
import { buildErrorResponse, ERROR_CODES } from '@app/common';

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
    let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR;
    let data: unknown = null;

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
        if (typeof resObj.code === 'string') {
          code = resObj.code;
        }
        if ('data' in resObj) {
          data = resObj.data;
        }
        if (Array.isArray(resObj.message)) {
          message = resObj.message.join(', ');
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else if (typeof resObj.error === 'string') {
          message = resObj.error;
        }
      }
      if (code === ERROR_CODES.INTERNAL_SERVER_ERROR) {
        code = this.defaultCodeForStatus(statusCode);
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

    const diagnostics = {
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
      requestId,
    };

    response
      .status(statusCode)
      .json(
        buildErrorResponse(
          statusCode,
          code,
          message,
          data === null || data === undefined
            ? diagnostics
            : typeof data === 'object'
              ? { ...data, ...diagnostics }
              : { value: data, ...diagnostics },
        ),
      );
  }

  private defaultCodeForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ERROR_CODES.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      case HttpStatus.BAD_GATEWAY:
        return ERROR_CODES.BAD_GATEWAY;
      case HttpStatus.GATEWAY_TIMEOUT:
        return ERROR_CODES.GATEWAY_TIMEOUT;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.DEPENDENCY_UNAVAILABLE;
      default:
        return ERROR_CODES.INTERNAL_SERVER_ERROR;
    }
  }
}
