import {
  type ArgumentsHost,
  type ExceptionFilter,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ERROR_CODES, type AppErrorResponseBody } from '../errors/app-error.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (!response || typeof response.status !== 'function') {
      // Non-HTTP context (e.g. Microservice RPC / Event)
      return;
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR;
    let message = 'Lỗi hệ thống nội bộ';
    let fieldErrors: Record<string, string[]> | undefined;
    let details: AppErrorResponseBody['details'] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        code = obj.code || this.defaultCodeForStatus(statusCode);
        message = obj.message || exception.message;
        fieldErrors = obj.fieldErrors;
        details = obj.details;

        // Handle default NestJS validation error format
        if (Array.isArray(obj.message) && !obj.code) {
          code = ERROR_CODES.VALIDATION_ERROR;
          message = 'Dữ liệu không hợp lệ';
          if (!fieldErrors) {
            fieldErrors = { validation: obj.message };
          }
        }
      } else if (typeof res === 'string') {
        message = res;
        code = this.defaultCodeForStatus(statusCode);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      message = exception.message || 'Lỗi hệ thống nội bộ';
    }

    const payload: AppErrorResponseBody = {
      statusCode,
      code,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      fieldErrors,
      details,
    };

    response.status(statusCode).json(payload);
  }

  private defaultCodeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
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
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.DEPENDENCY_UNAVAILABLE;
      case HttpStatus.GATEWAY_TIMEOUT:
        return ERROR_CODES.GATEWAY_TIMEOUT;
      default:
        return ERROR_CODES.INTERNAL_SERVER_ERROR;
    }
  }
}
