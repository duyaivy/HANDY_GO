import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto, buildSuccessResponse } from '@app/common';
import { TrustedGatewayGuard } from '../common/trusted-gateway.guard.js';
import { AdminGuard } from '../common/admin.guard.js';
import { GatewayUserId } from '../common/gateway-user-id.decorator.js';
import { NotificationsService } from './notifications.service.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';
import { AdminBroadcastNotificationDto } from './dto/broadcast-notification.dto.js';
import {
  NotificationListDtoEnvelope,
  NotificationResponseDtoEnvelope,
  UnreadCountDtoEnvelope,
  ReadAllDtoEnvelope,
  BroadcastResponseDtoEnvelope,
} from './dto/notifications-response.dto.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(TrustedGatewayGuard)
@ApiResponse({
  status: 400,
  type: ApiErrorResponseDto,
  description: 'Invalid input or cursor',
})
@ApiResponse({
  status: 401,
  type: ApiErrorResponseDto,
  description: 'Missing or invalid identity/access token',
})
@ApiResponse({
  status: 403,
  type: ApiErrorResponseDto,
  description: 'Untrusted gateway',
})
@ApiResponse({
  status: 503,
  type: ApiErrorResponseDto,
  description: 'Storage unavailable',
})
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List owned notifications, newest first',
    description:
      'Keyset order: createdAt DESC, id DESC. Read status is independent of delivery status. Reading this endpoint does not mark notifications as read.',
  })
  @ApiResponse({ status: 200, type: NotificationListDtoEnvelope })
  async list(
    @GatewayUserId() userId: string,
    @Query() query: ListNotificationsDto,
  ) {
    return buildSuccessResponse(
      await this.service.list(userId, query),
      'Notifications retrieved',
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count owned unread notifications' })
  @ApiResponse({ status: 200, type: UnreadCountDtoEnvelope })
  async unreadCount(@GatewayUserId() userId: string) {
    return buildSuccessResponse(
      await this.service.unreadCount(userId),
      'Unread count retrieved',
    );
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark all owned unread notifications as read',
    description:
      'One bulk update. Repeated calls return updatedCount: 0 unless new unread notifications exist.',
  })
  @ApiResponse({ status: 200, type: ReadAllDtoEnvelope })
  async markAllRead(@GatewayUserId() userId: string) {
    return buildSuccessResponse(
      await this.service.markAllRead(userId),
      'Notifications marked as read',
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an owned notification without marking it as read',
  })
  @ApiResponse({ status: 200, type: NotificationResponseDtoEnvelope })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async findOne(
    @GatewayUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return buildSuccessResponse(
      await this.service.findOne(userId, id),
      'Notification retrieved',
    );
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark an owned notification as read',
    description: 'Preserves the first readAt timestamp on repeated requests.',
  })
  @ApiResponse({ status: 200, type: NotificationResponseDtoEnvelope })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async markRead(
    @GatewayUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return buildSuccessResponse(
      await this.service.markRead(userId, id),
      'Notification marked as read',
    );
  }

  @Post('admin/broadcast')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Admin phát/test thông báo in-app và push notification đến người dùng',
    description:
      'Tạo thông báo in-app và push notification (FCM) kèm payload sự kiện mô phỏng (order, proposal, bid, payment, wallet, matching, system) để kiểm thử hoặc phát thông báo thực tế cho người dùng/thiết bị mobile. Yêu cầu quyền Admin.',
  })
  @ApiResponse({
    status: 201,
    type: BroadcastResponseDtoEnvelope,
    description: 'Phát thông báo thành công',
  })
  @ApiResponse({
    status: 403,
    type: ApiErrorResponseDto,
    description: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này',
  })
  @ApiBody({
    type: AdminBroadcastNotificationDto,
    description:
      'Dữ liệu phát hoặc kiểm thử thông báo/push notification. Chọn các ví dụ mẫu bên dưới để kiểm thử các sự kiện thực tế.',
    examples: {
      orderCreated: {
        summary: '1. Test Push: Đơn hàng mới (order.created)',
        description:
          'Mô phỏng sự kiện đơn hàng được tạo, gửi push tới khách/thợ',
        value: {
          eventType: 'order.created',
          targetGroup: 'CUSTOMERS',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
        },
      },
      orderStatusChanged: {
        summary: '2. Test Push: Cập nhật trạng thái đơn (order.status.changed)',
        description:
          'Mô phỏng sự kiện đơn hàng chuyển sang trạng thái đang thực hiện',
        value: {
          eventType: 'order.status.changed',
          targetGroup: 'CUSTOMERS',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
        },
      },
      orderCompleted: {
        summary: '3. Test Push: Đơn hàng hoàn thành (order.completed)',
        description: 'Mô phỏng sự kiện đơn hàng hoàn tất',
        value: {
          eventType: 'order.completed',
          targetGroup: 'CUSTOMERS',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
        },
      },
      bidSubmitted: {
        summary: '4. Test Push: Báo giá mới từ Thợ (bid.submitted)',
        description:
          'Mô phỏng sự kiện thợ gửi báo giá cho yêu cầu của khách hàng',
        value: {
          eventType: 'bid.submitted',
          title: 'Bạn có báo giá mới',
          body: 'Thợ Nguyễn Văn A vừa gửi báo giá 200.000đ cho yêu cầu sửa điện của bạn.',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
          payload: {
            bidAmount: 200000,
            workerName: 'Nguyễn Văn A',
          },
        },
      },
      bookingProposal: {
        summary:
          '5. Test Push: Lời đề nghị làm việc (booking_proposal.created)',
        description:
          'Mô phỏng khách hàng gửi đề nghị làm việc trực tiếp đến thợ',
        value: {
          eventType: 'booking_proposal.created',
          targetGroup: 'WORKERS',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
        },
      },
      matchingReady: {
        summary:
          '6. Test Push: Công việc mới phù hợp (matching.eligible_workers.ready)',
        description: 'Mô phỏng hệ thống tìm thấy công việc phù hợp cho thợ',
        value: {
          eventType: 'matching.eligible_workers.ready',
          targetGroup: 'WORKERS',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
        },
      },
      paymentSucceeded: {
        summary: '7. Test Push: Thanh toán thành công (payment.succeeded)',
        description: 'Mô phỏng sự kiện giao dịch thanh toán thành công',
        value: {
          eventType: 'payment.succeeded',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
          payload: {
            amount: 350000,
            paymentMethod: 'VNPAY',
          },
        },
      },
      walletCredited: {
        summary: '8. Test Push: Biến động số dư ví (wallet.credited)',
        description: 'Mô phỏng sự kiện ví HandyGo được nạp/cộng tiền',
        value: {
          eventType: 'wallet.credited',
          recipientUserIds: ['123e4567-e89b-12d3-a456-426614174000'],
          sendPush: true,
          payload: {
            amount: 500000,
          },
        },
      },
      broadcastAll: {
        summary: '9. Phát thông báo hệ thống đến tất cả (admin.broadcast)',
        description:
          'Thông báo chung/bảo trì gửi đến toàn bộ người dùng active',
        value: {
          title: 'Thông báo nâng cấp hệ thống định kỳ',
          body: 'Hệ thống HANDY GO sẽ bảo trì định kỳ từ 01:00 đến 03:00 ngày mai. Kính mong quý khách thông cảm vì sự gián đoạn này.',
          eventType: 'admin.broadcast',
          targetGroup: 'ALL',
          sendPush: true,
        },
      },
    },
  })
  async broadcast(
    @GatewayUserId() adminUserId: string,
    @Body() dto: AdminBroadcastNotificationDto,
  ) {
    return buildSuccessResponse(
      await this.service.broadcast(adminUserId, dto),
      'Phát thông báo thành công',
      HttpStatus.CREATED,
    );
  }
}
