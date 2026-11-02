import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Use only behind TrustedGatewayGuard. Identity is injected by the gateway,
 * not a caller-supplied API parameter, so Swagger must not document a header.
 */
export const GatewayUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.headers['x-user-id'] as string;
  },
);
