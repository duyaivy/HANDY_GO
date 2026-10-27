import { Controller, Get, Headers, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES, buildSuccessResponse } from '@app/common';
import { assertTrustedSecret, requireAdminActor } from '../common/utils/trusted-request.util.js';
import { DeadLetterService } from './dead-letter.service.js';

@Controller('internal/dead-letters')
export class DeadLetterController {
  constructor(
    private readonly service: DeadLetterService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(
    @Headers('x-internal-secret') secret: string | undefined,
    @Headers('x-user-roles') roles: string | undefined,
    @Headers('x-user-id') userId: string | undefined,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    assertTrustedSecret(this.config.internalServiceSecret, secret);
    requireAdminActor(roles, userId);
    const p = Number(page);
    const l = Number(limit);
    if (!Number.isInteger(p) || p < 1 || !Number.isInteger(l) || l < 1 || l > 100) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'page must be >= 1 and limit must be between 1 and 100');
    }
    return buildSuccessResponse(await this.service.list((p - 1) * l, l), 'Dead letters retrieved');
  }

  @Post(':id/replay')
  async replay(
    @Headers('x-internal-secret') secret: string | undefined,
    @Headers('x-user-roles') roles: string | undefined,
    @Headers('x-user-id') userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    assertTrustedSecret(this.config.internalServiceSecret, secret);
    const actorId = requireAdminActor(roles, userId);
    return buildSuccessResponse(await this.service.replay(id, actorId), 'Dead letter replayed');
  }
}
