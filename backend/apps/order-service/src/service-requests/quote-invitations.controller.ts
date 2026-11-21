import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { buildSuccessResponse } from '@app/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUserId } from '../common/decorators/current-user.decorator.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import { QuoteInvitationsService } from './quote-invitations.service.js';

export class CreateQuoteInvitationDto {
  @IsUUID()
  workerUserId!: string;

  @IsUUID()
  sourceMatchResultId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@UseGuards(TrustedGatewayGuard)
@Controller('service-requests/:id/quote-invitations')
export class QuoteInvitationsController {
  constructor(private readonly invitations: QuoteInvitationsService) {}

  @Get()
  async list(
    @Param('id', ParseUUIDPipe) requestId: string,
    @CurrentUserId() userId: string,
  ) {
    return buildSuccessResponse(await this.invitations.list(requestId, userId));
  }

  @Post()
  async create(
    @Param('id', ParseUUIDPipe) requestId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateQuoteInvitationDto,
  ) {
    const invitation = await this.invitations.create(requestId, userId, dto);
    return buildSuccessResponse(invitation, 'Quote invitation sent', 201);
  }
}
