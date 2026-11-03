import { Body, Controller, Headers, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import crypto from 'node:crypto';
import { WalletProvisioningService } from './wallet-provisioning.service.js';
import { ProvisionWalletDto } from './dto/provision-wallet.dto.js';
@Controller('internal/wallets')
export class WalletProvisioningController {
  constructor(private readonly service: WalletProvisioningService, private readonly config: ConfigService) {}
  @Post('provision') async provision(@Headers('x-internal-secret') secret: string | undefined, @Body() dto: ProvisionWalletDto) {
    const expected = this.config.internalServiceSecret;
    if (!expected || !secret || secret.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Trusted service authentication required');
    return buildSuccessResponse(await this.service.provision(dto.userId), 'Wallet provisioned');
  }
}
