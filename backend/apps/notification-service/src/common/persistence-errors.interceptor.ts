import {
  Injectable,
  HttpException,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { Prisma } from '@prisma/notification-client';
import { catchError, throwError } from 'rxjs';

// Prisma diagnostics can contain query arguments (including push tokens).
// Translate before the shared exception filter logs or returns the exception.
@Injectable()
export class PersistenceErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException) return throwError(() => error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
            return throwError(
              () =>
                new AppException(
                  409,
                  ERROR_CODES.CONFLICT,
                  'The operation conflicts with existing data; refresh and try again',
                ),
            );
          }
          if (error.code === 'P2025') {
            return throwError(
              () =>
                new AppException(
                  404,
                  ERROR_CODES.NOT_FOUND,
                  'Resource not found',
                ),
            );
          }
        }
        return throwError(
          () =>
            new AppException(
              503,
              ERROR_CODES.DEPENDENCY_UNAVAILABLE,
              'Notification storage is temporarily unavailable',
            ),
        );
      }),
    );
  }
}
