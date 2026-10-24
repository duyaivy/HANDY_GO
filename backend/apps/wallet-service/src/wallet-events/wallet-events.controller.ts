import { Body, Controller, Headers, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { WalletEventsService } from './wallet-events.service.js';
import { PublishOutboxDto } from './dto/publish-outbox.dto.js';
@Controller('internal/wallet-events')
export class WalletEventsController {
  constructor(private readonly service: WalletEventsService, private readonly config: ConfigService) {}
  @Post('publish-pending') async publish(@Headers('x-internal-secret') secret: string|undefined, @Body() _dto: PublishOutboxDto) { const e=this.config.internalServiceSecret; if(!e||!secret||secret.length!==e.length||!crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(e))) throw new AppException(HttpStatus.FORBIDDEN,ERROR_CODES.FORBIDDEN,'Trusted service authentication required'); return buildSuccessResponse({ published: await this.service.publishPending() },'Outbox processed'); }
}
