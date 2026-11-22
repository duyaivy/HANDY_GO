import { Controller, Get, Headers, Param, ParseUUIDPipe, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '@app/auth';
import { ConfigService } from '@app/config';
import { AuthPrismaService } from '@app/database';
import { buildSuccessResponse } from '@app/common';

@Controller('internal/users')
export class UserContactController {
  constructor(
    private readonly db: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get(':userId/contact')
  async getContact(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Headers('x-internal-secret') secret?: string,
  ) {
    const expected = this.config.internalServiceSecret;
    if (
      !secret || !expected ||
      Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    ) {
      throw new UnauthorizedException();
    }
    const account = await this.db.account.findFirst({
      where: { userId, status: 'active' },
      select: { phone: true },
    });
    return buildSuccessResponse({ phone: account?.phone ?? null });
  }
}
