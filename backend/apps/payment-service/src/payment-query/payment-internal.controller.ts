import { timingSafeEqual } from 'node:crypto';
import { Controller, ForbiddenException, Get, Headers, Param, ParseUUIDPipe } from '@nestjs/common';
import { buildSuccessResponse } from '@app/common';
import { ConfigService } from '@app/config';
import { PaymentQueryService } from './payment-query.service.js';

@Controller('internal/payments')
export class PaymentInternalController {
  constructor(private readonly config: ConfigService, private readonly query: PaymentQueryService) {}

  @Get('order/:orderId/refundable')
  async refundable(@Headers('x-internal-secret') provided: string | undefined, @Param('orderId', ParseUUIDPipe) orderId: string) {
    const expected = this.config.internalServiceSecret;
    if (!expected || !provided || Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
      throw new ForbiddenException('Internal authentication required');
    }
    return buildSuccessResponse(await this.query.refundableByOrder(orderId), 'Refundability retrieved');
  }
}
