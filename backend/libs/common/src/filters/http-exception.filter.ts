import {
  type ArgumentsHost,
  type ExceptionFilter,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { buildErrorResponse } from '../dto/api-response.dto.js';
import {
  ERROR_CODES,
  type AppErrorData,
  type AppErrorResponseBody,
} from '../errors/app-error.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (!response || typeof response.status !== 'function') {
      // Non-HTTP context (e.g. Microservice RPC / Event)
      return;
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR;
    let message = 'Lỗi hệ thống nội bộ';
    let data: AppErrorData | null = null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        code = obj.code || this.defaultCodeForStatus(statusCode);
        message = obj.message || exception.message;
        const legacyDetails = obj.details as AppErrorData | undefined;
        const fieldErrors = (obj.fieldErrors || obj.errors) as
          Record<string, string[]> | undefined;
        data =
          obj.data && typeof obj.data === 'object'
            ? (obj.data as AppErrorData)
            : legacyDetails || fieldErrors
              ? { ...legacyDetails, fieldErrors }
              : null;

        // Handle default NestJS validation error format
        if (Array.isArray(obj.message) && !obj.code) {
          code = ERROR_CODES.VALIDATION_ERROR;
          message = 'Dữ liệu không hợp lệ';
          if (!data?.fieldErrors) {
            data = {
              ...data,
              fieldErrors: { validation: obj.message },
            };
          }
        }
      } else if (typeof res === 'string') {
        message = res;
        code = this.defaultCodeForStatus(statusCode);
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'Lỗi hệ thống nội bộ';
    }

    const formattedMessage =
      typeof message === 'string' ? message : JSON.stringify(message);
    const method = request?.method || '';
    const url = request?.originalUrl || request?.url || '';
    const logInfo = `[${statusCode}] ${method} ${url} - ${formattedMessage}`;

    if (statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(logInfo, stack);
    } else if (statusCode >= 400) {
      this.logger.warn(logInfo);
    }

    // Gắn exception vào response để pino-http có thể lấy đúng message lỗi thực tế thay vì 'failed with status code 500'
    (response as any).err =
      exception instanceof Error ? exception : new Error(formattedMessage);

    const payload: AppErrorResponseBody = buildErrorResponse(
      statusCode,
      code,
      formattedMessage,
      data,
    );

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
