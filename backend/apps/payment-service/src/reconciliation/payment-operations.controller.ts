import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { AdminAuditService } from '../common/audit/admin-audit.service.js';
import {
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from '../common/auth/admin-access.js';
import { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import { PaymentOperationsService } from './payment-operations.service.js';
import { PaymentReconcilerService } from './payment-reconciler.service.js';

export class OperationReasonDto {
  @IsString()
  @Length(1, 1000)
  @Matches(/\S/)
  reason!: string;
}
export class ReplayInboundDto extends OperationReasonDto {
  @IsString()
  @Length(1, 200)
  eventId!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('payments/admin/operations')
export class PaymentOperationsController {
  constructor(
    private readonly service: PaymentOperationsService,
    private readonly reconciler: PaymentReconcilerService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('dead-letters')
  async deadLetters(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentPaginationDto,
  ) {
    requireAdminPermission(user, PAYMENT_PERMISSIONS.dlqReplay);
    return buildSuccessResponse(await this.service.deadLetters(query));
  }

  @Post('replay')
  async replay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplayInboundDto,
  ) {
    return buildSuccessResponse(
      await this.service.replay(
        requireAdminPermission(user, PAYMENT_PERMISSIONS.dlqReplay),
        dto.eventId,
        dto.reason,
      ),
    );
  }

  @Get('reports')
  async reports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentPaginationDto,
  ) {
    requireAdminPermission(user, PAYMENT_PERMISSIONS.reconcile);
    return buildSuccessResponse(await this.service.reports(query));
  }

  @Post('reconcile')
  async reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OperationReasonDto,
  ) {
    const actorUserId = requireAdminPermission(
      user,
      PAYMENT_PERMISSIONS.reconcile,
    );
    await this.audit.record(undefined, {
      actorUserId,
      action: 'reconciliation.requested',
      entityType: 'payment_service',
      entityId: 'reconciliation',
      reason: dto.reason,
    });
    const result = await this.reconciler.runOnce();
    await this.audit.record(undefined, {
      actorUserId,
      action: 'reconciliation.finished',
      entityType: 'payment_service',
      entityId: 'reconciliation',
      after: result,
      reason: dto.reason,
    });
    return buildSuccessResponse(result);
  }
}
