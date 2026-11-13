import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import type { Request } from 'express';
import { requireUserId } from '../common/auth/require-user-id.js';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import { CreateTopupDto } from './dto/create-topup.dto.js';
import { SimulateTopupDto } from './dto/simulate-topup.dto.js';
import {
  TopupsService,
  WALLET_TOPUP_CREDITED,
  type IpnResponse,
} from './topups.service.js';

function clientIp(req: Request): string {
  const raw = (req.ip ?? '').replace(/^::ffff:/, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(raw) ? raw : '127.0.0.1';
}

// Provider callback: authenticated by the provider's signature, not by a user JWT.
@ApiTags('Payment top-ups')
@Controller('payments/topups')
export class TopupIpnController {
  constructor(private readonly service: TopupsService) {}

  @Get('vnpay/ipn')
  ipn(@Query() query: Record<string, string>): Promise<IpnResponse> {
    return this.service.handleIpn(query);
  }

  @Get('vnpay/return')
  browserReturn() {
    // Public, read-only landing response. Browser parameters cannot settle a top-up.
    return buildSuccessResponse(
      {
        confirmed: false,
        statusEndpoint: 'GET /payments/topups/:id',
        authenticationRequired: true,
      },
      'Query your top-up status after signing in; the browser return does not confirm credit',
    );
  }
}

@ApiTags('Payment top-ups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments/topups')
export class TopupsController {
  constructor(private readonly service: TopupsService) {}

  @Post(':id/simulate')
  async simulate(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SimulateTopupDto) {
    return buildSuccessResponse(await this.service.simulate(requireUserId(user), id, dto.outcome), 'Simulated provider result recorded; query status for Wallet confirmation');
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateTopupDto,
    @Req() req: Request,
  ) {
    return buildSuccessResponse(
      await this.service.create(requireUserId(user), dto, clientIp(req)),
      'Top-up created',
    );
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: PaymentPaginationDto,
  ) {
    return buildSuccessResponse(
      await this.service.list(requireUserId(user), query),
      'Top-ups retrieved',
    );
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return buildSuccessResponse(
      await this.service.get(requireUserId(user), id),
      'Top-up retrieved',
    );
  }
}

@Controller()
export class WalletTopupEventsConsumer {
  constructor(private readonly inbox: PaymentInboxService) {}

  @EventPattern(WALLET_TOPUP_CREDITED)
  credited(@Payload() payload: unknown, @Ctx() context: unknown) {
    return this.inbox.consume(
      WALLET_TOPUP_CREDITED,
      payload,
      context as RmqContext,
    );
  }
}
