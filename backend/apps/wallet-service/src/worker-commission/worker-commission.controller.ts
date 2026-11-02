import { Body, Controller, Headers, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { WorkerCommissionService } from './worker-commission.service.js';
import { CollectCommissionDto } from './dto/collect-commission.dto.js';
@Controller('internal/wallets/commission')
export class WorkerCommissionController {
  constructor(private readonly service: WorkerCommissionService, private readonly config: ConfigService) {}
  @Post('collect') async collect(@Headers('x-internal-secret') secret: string|undefined, @Body() dto: CollectCommissionDto) { const e=this.config.internalServiceSecret; if(!e||!secret||secret.length!==e.length||!crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(e))) throw new AppException(HttpStatus.FORBIDDEN,ERROR_CODES.FORBIDDEN,'Trusted service authentication required'); return buildSuccessResponse(await this.service.collect(dto),'Commission collected'); }
}
