import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppException, ERROR_CODES } from '../errors/app-error.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function createHttpContext() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status } as unknown as Response;
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/auth/register',
  } as Request;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;

  return { host, json, status };
}

describe('HttpExceptionFilter response envelope', () => {
  it('places business error details in data', () => {
    const { host, json, status } = createHttpContext();
    const exception = new AppException(
      HttpStatus.FAILED_DEPENDENCY,
      ERROR_CODES.OTP_DELIVERY_FAILED,
      'Không gửi được OTP',
      {
        data: {
          verification: {
            phone: '+84912345678',
            emailMasked: 'c***r@example.com',
            resendAvailableAt: '2026-10-07T10:00:00.000Z',
          },
        },
      },
    );

    new HttpExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FAILED_DEPENDENCY);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.FAILED_DEPENDENCY,
      code: ERROR_CODES.OTP_DELIVERY_FAILED,
      message: 'Không gửi được OTP',
      data: {
        verification: {
          phone: '+84912345678',
          emailMasked: 'c***r@example.com',
          resendAvailableAt: '2026-10-07T10:00:00.000Z',
        },
      },
    });
  });

  it('always returns data null when an error has no extra data', () => {
    const { host, json } = createHttpContext();
    const exception = new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.EMAIL_ALREADY_EXISTS,
      'Email đã được đăng ký',
    );

    new HttpExceptionFilter().catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
      message: 'Email đã được đăng ký',
      data: null,
    });
  });

  it('normalizes Nest validation errors into data.fieldErrors', () => {
    const { host, json } = createHttpContext();
    const exception = new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['email must be an email'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    new HttpExceptionFilter().catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Dữ liệu không hợp lệ',
      data: {
        fieldErrors: { validation: ['email must be an email'] },
      },
    });
  });
});
