import { HttpException, HttpStatus } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERROR_CODES } from '@app/common';

export function configureDashboardRankingBodyParser(
  app: NestExpressApplication,
  apiPrefix: string,
): void {
  const prefix = apiPrefix.replace(/^\/+|\/+$/g, '');
  const rankingPath =
    `/${prefix ? `${prefix}/` : ''}internal/workers/dashboard-ranking`.toLowerCase();
  app.useBodyParser('json', {
    limit: '1mb',
    type: (request) => {
      const path = request.url?.split('?')[0].replace(/\/$/, '').toLowerCase();
      const contentType = request.headers['content-type']
        ?.split(';')[0]
        .trim()
        .toLowerCase();
      return (
        request.method === 'POST' &&
        path === rankingPath &&
        contentType === 'application/json'
      );
    },
  });
  // The first parser consumes matching requests; this parser handles all other
  // JSON requests with Express's default 100 KiB limit.
  app.useBodyParser('json');
  app.use(
    (
      error: { type?: string; status?: number },
      _request: unknown,
      _response: unknown,
      next: (error: unknown) => void,
    ) => {
      // Preserve 413 through the application's shared HttpExceptionFilter.
      next(
        error?.type === 'entity.too.large' && error.status === 413
          ? new HttpException(
              {
                code: ERROR_CODES.VALIDATION_ERROR,
                message: 'Request body exceeds the allowed size',
              },
              HttpStatus.PAYLOAD_TOO_LARGE,
            )
          : error,
      );
    },
  );
}
