import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '@app/auth';
import { ConfigService } from '@app/config';
import { AuthPrismaService } from '@app/database';
import { buildSuccessResponse } from '@app/common';

@Controller('internal/admin/dashboard')
export class DashboardCustomersController {
  constructor(
    private readonly db: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('registered-customers')
  async registeredCustomers(
    @Query('endExclusive') endInput: string,
    @Headers('x-internal-secret') secret?: string,
  ) {
    const expected = this.config.internalServiceSecret;
    if (
      !secret ||
      !expected ||
      Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    ) {
      throw new UnauthorizedException();
    }
    const end = new Date(endInput);
    if (!Number.isFinite(end.getTime())) {
      throw new BadRequestException('Invalid dashboard period');
    }
    const count = await this.db.customerRegistration.count({
      where: {
        registeredAt: { lt: end },
      },
    });
    return buildSuccessResponse(count);
  }
}
