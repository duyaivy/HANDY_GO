import { Controller, Get, Headers, HttpStatus, Param } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { WalletLedgerService } from './wallet-ledger.service.js';
@Controller('internal/wallet-ledger')
export class WalletLedgerController {
  constructor(private readonly service: WalletLedgerService, private readonly config: ConfigService) {}
  @Get('operations/:operationId') async getOperation(@Headers('x-internal-secret') secret: string|undefined, @Param('operationId') operationId: string) {
    const e=this.config.internalServiceSecret;
    if(!e||!secret||secret.length!==e.length||!crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(e))) throw new AppException(HttpStatus.FORBIDDEN,ERROR_CODES.FORBIDDEN,'Trusted service authentication required');
    const result=await this.service.getOperation(operationId);
    if(!result) throw new AppException(HttpStatus.NOT_FOUND,ERROR_CODES.NOT_FOUND,'Ledger operation not found');
    return buildSuccessResponse(result,'Ledger operation retrieved');
  }
}
