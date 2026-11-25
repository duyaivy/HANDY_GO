import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiProperty({
    example: 'Kích hoạt quét đối soát định kỳ và xử lý giao dịch tồn',
    description: 'Lý do thực hiện thao tác vận hành (bắt buộc)',
  })
  @IsString()
  @Length(1, 1000)
  @Matches(/\S/)
  reason!: string;
}

export class ReplayInboundDto extends OperationReasonDto {
  @ApiProperty({
    example: 'evt-order-completed-12345',
    description: 'Mã định danh của sự kiện trong Dead Letter Queue (eventId)',
  })
  @IsString()
  @Length(1, 200)
  eventId!: string;
}

@ApiTags('Payment Operations & Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments/admin/operations')
export class PaymentOperationsController {
  constructor(
    private readonly service: PaymentOperationsService,
    private readonly reconciler: PaymentReconcilerService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('dead-letters')
  @ApiOperation({
    summary: 'Admin xem danh sách sự kiện lỗi Dead Letter Queue (DLQ)',
    description:
      'Lấy danh sách các inbound event bị lỗi không xử lý được và chuyển vào DLQ (chỉ trả về metadata như eventId, eventType, attempts; không trả payload nhạy cảm). Yêu cầu quyền payment:dlq:replay.',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách DLQ thành công' })
  @ApiResponse({ status: 403, description: 'Thiếu quyền payment:dlq:replay' })
  async deadLetters(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentPaginationDto,
  ) {
    requireAdminPermission(user, PAYMENT_PERMISSIONS.dlqReplay);
    return buildSuccessResponse(await this.service.deadLetters(query));
  }

  @Post('replay')
  @ApiOperation({
    summary: 'Admin yêu cầu phát lại (Replay) sự kiện trong DLQ',
    description:
      'Chỉ định eventId cần replay sau khi dịch vụ phụ thuộc đã được khắc phục. Mỗi event chỉ được replay 1 lần và ghi lại audit log. Yêu cầu quyền payment:dlq:replay.',
  })
  @ApiBody({ type: ReplayInboundDto })
  @ApiResponse({
    status: 201,
    description: 'Lên lịch replay sự kiện thành công',
  })
  @ApiResponse({ status: 403, description: 'Thiếu quyền payment:dlq:replay' })
  @ApiResponse({
    status: 409,
    description: 'Sự kiện đã được lên lịch replay hoặc không ở trạng thái dead',
  })
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
  @ApiOperation({
    summary: 'Admin xem danh sách báo cáo đối soát hằng ngày',
    description:
      'Tra cứu các báo cáo đối soát settlement, topup và refund được tổng hợp theo ngày (theo múi giờ Việt Nam). Yêu cầu quyền payment:reconcile.',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách báo cáo thành công' })
  @ApiResponse({ status: 403, description: 'Thiếu quyền payment:reconcile' })
  async reports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaymentPaginationDto,
  ) {
    requireAdminPermission(user, PAYMENT_PERMISSIONS.reconcile);
    return buildSuccessResponse(await this.service.reports(query));
  }

  @Post('reconcile')
  @ApiOperation({
    summary: 'Admin kích hoạt chạy quy trình đối soát thủ công',
    description:
      'Chạy một lượt quét đối soát (runOnce) để xử lý các giao dịch hoặc payout còn tồn đọng/chờ xác nhận. Ghi audit log trước và sau khi thực hiện. Yêu cầu quyền payment:reconcile.',
  })
  @ApiBody({ type: OperationReasonDto })
  @ApiResponse({ status: 200, description: 'Chạy đối soát hoàn tất' })
  @ApiResponse({ status: 403, description: 'Thiếu quyền payment:reconcile' })
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
