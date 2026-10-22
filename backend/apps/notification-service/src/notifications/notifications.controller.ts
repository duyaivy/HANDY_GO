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
    summary: 'Admin phát thông báo in-app đến toàn bộ hoặc nhóm người dùng',
    description:
      'Tạo thông báo in-app hàng loạt cho toàn bộ người dùng active hoặc nhóm mục tiêu (Customers/Workers), tôn trọng cài đặt nhận thông báo của người dùng. Yêu cầu quyền Admin.',
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
