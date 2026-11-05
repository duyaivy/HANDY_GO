import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { GatewayUser } from './tracking-security.util.js';

export const CurrentGatewayUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GatewayUser => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.gatewayUser!;
  },
);
