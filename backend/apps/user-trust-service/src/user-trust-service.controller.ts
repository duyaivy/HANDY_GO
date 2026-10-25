import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  PermissionsGuard,
  Public,
  RequirePermissions,
  StandardPermissions,
  type AuthenticatedUser,
} from '@app/auth';
import { EVENT_PATTERNS, type DomainEvent } from '@app/common';
import {
  UserTrustServiceService,
  type UserRegisteredData,
} from './user-trust-service.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

import { ConfigService } from '@app/config';
import crypto from 'node:crypto';

@ApiTags('User & Trust')
@Controller()
export class UserTrustServiceController {
  constructor(
    private readonly userTrustService: UserTrustServiceService,
    private readonly config: ConfigService,
  ) {}

  private readonly logger = new Logger(UserTrustServiceController.name);

  /**
   * RabbitMQ Event Consumer for 'user.registered'.
   * Creates User and the profile selected by the registration role.
   * Only ACKs after transaction commits.
   */
  @EventPattern(EVENT_PATTERNS.USER_REGISTERED)
  async handleUserRegistered(
    @Payload() event: DomainEvent<UserRegisteredData>,
    @Ctx() context: any,
  ): Promise<unknown> {
    try {
      const result = await this.userTrustService.handleUserRegistered(event);
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
      return result;
    } catch (err) {
      this.logger.error(
        `Failed to handle user.registered event ${event?.eventId}: ${(err as Error).message}`,
      );
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.nack(originalMsg, false, true);
        }
      }
      throw err;
    }
  }

  /**
   * Internal RabbitMQ RPC to provide user status to Auth Service.
   */
  @MessagePattern('user.auth-status')
  async getUserAuthStatus(
    @Payload() data: { userId: string; roles: string[] },
    @Ctx() context?: any,
  ): Promise<{ exists: boolean; status: string; isProvisioned: boolean }> {
    try {
      return await this.userTrustService.getUserAuthStatus(data.userId, data.roles);
    } finally {
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
    }
  }

  /**
   * Internal RabbitMQ RPC to retrieve active user IDs for broadcast notifications.
   */
  @MessagePattern('user.get-all-active-ids')
  async getAllActiveUserIds(
    @Payload() data?: { targetGroup?: 'ALL' | 'CUSTOMERS' | 'WORKERS' },
    @Ctx() context?: any,
  ): Promise<{ userIds: string[] }> {
    try {
      return await this.userTrustService.getAllActiveUserIds(data?.targetGroup);
    } finally {
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
    }
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('users/me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ của tài khoản đang đăng nhập' })
  @ApiResponse({ status: 200, description: 'Lấy hồ sơ thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập' })
  async getMyProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.userTrustService.getProfile(
      user.userId,
      user.userId,
      user.permissions,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Patch('users/me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ tài khoản đang đăng nhập' })
  @ApiResponse({ status: 200, description: 'Cập nhật hồ sơ thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập' })
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<unknown> {
    return this.userTrustService.updateProfile(
      user.userId,
      user.userId,
      dto,
      user.permissions,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ theo ID người dùng' })
  @ApiResponse({ status: 200, description: 'Lấy hồ sơ thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem hồ sơ người khác' })
  async getUserProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userTrustService.getProfile(user.userId, id, user.permissions);
  }

  /**
   * RabbitMQ Event Consumer for 'kyc.pending' (when verification is queued).
   */
  @EventPattern(EVENT_PATTERNS.KYC_PENDING)
  async handleKycPending(
    @Payload() event: DomainEvent<any>,
    @Ctx() context: any,
  ): Promise<unknown> {
    try {
      const result = await this.userTrustService.handleKycPending(event);
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
      return result;
    } catch (err) {
      this.logger.error(
        `Failed to handle kyc.pending event: ${(err as Error).message}`,
      );
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.nack(originalMsg, false, false);
        }
      }
      throw err;
    }
  }

  /**
   * RabbitMQ Event Consumer for 'kyc.submitted' (when AI verification succeeds).
   */
  @EventPattern(EVENT_PATTERNS.KYC_SUBMITTED)
  async handleKycSubmitted(
    @Payload() event: DomainEvent<any>,
    @Ctx() context: any,
  ): Promise<unknown> {
    try {
      const result = await this.userTrustService.handleKycSubmitted(event);
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
      return result;
    } catch (err) {
      this.logger.error(
        `Failed to handle kyc.submitted event: ${(err as Error).message}`,
      );
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.nack(originalMsg, false, false);
        }
      }
      throw err;
    }
  }

  /**
   * RabbitMQ Event Consumer for 'kyc.reviewing' (when AI verification finishes and awaits admin review).
   */
  @EventPattern(EVENT_PATTERNS.KYC_REVIEWING)
  async handleKycReviewing(
    @Payload() event: DomainEvent<any>,
    @Ctx() context: any,
  ): Promise<unknown> {
    try {
      const result = await this.userTrustService.handleKycReviewing(event);
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
      return result;
    } catch (err) {
      this.logger.error(
        `Failed to handle kyc.reviewing event: ${(err as Error).message}`,
      );
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.nack(originalMsg, false, false);
        }
      }
      throw err;
    }
  }

  /**
   * RabbitMQ Event Consumer for 'kyc.completed' (when Admin approves verification).
   */
  @EventPattern(EVENT_PATTERNS.KYC_COMPLETED)
  async handleKycCompleted(
    @Payload() event: DomainEvent<any>,
    @Ctx() context: any,
  ): Promise<unknown> {
    try {
      const result = await this.userTrustService.handleKycCompleted(event);
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
      return result;
    } catch (err) {
      this.logger.error(
        `Failed to handle kyc.completed event: ${(err as Error).message}`,
      );
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.nack(originalMsg, false, false);
        }
      }
      throw err;
    }
  }

  /**
   * RabbitMQ Event Consumer for 'kyc.failed' (when AI verification fails or rejected).
   */
  @EventPattern(EVENT_PATTERNS.KYC_FAILED)
  async handleKycFailed(
    @Payload() event: DomainEvent<any>,
    @Ctx() context: any,
  ): Promise<unknown> {
    try {
      const result = await this.userTrustService.handleKycFailed(event);
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.ack(originalMsg);
        }
      }
      return result;
    } catch (err) {
      this.logger.error(
        `Failed to handle kyc.failed event: ${(err as Error).message}`,
      );
      if (context && typeof context.getChannelRef === 'function') {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        if (channel && originalMsg) {
          channel.nack(originalMsg, false, false);
        }
      }
      throw err;
    }
  }

  /**
   * Internal endpoint for BFF / Inter-service worker profile enrichment (F12)
   */
  @Public()
  @Get('internal/workers/batch-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy tóm tắt hồ sơ thợ (Inter-service / BFF enrichment)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách tóm tắt thợ thành công' })
  async getWorkersBatchSummary(
    @Query('ids') ids?: string,
    @Headers('x-internal-secret') internalSecret?: string,
  ): Promise<any[]> {
    const expectedSecret = this.config.internalServiceSecret;
    const isValid =
      !!expectedSecret &&
      !!internalSecret &&
      internalSecret.length === expectedSecret.length &&
      crypto.timingSafeEqual(
        Buffer.from(internalSecret),
        Buffer.from(expectedSecret),
      );

    if (!isValid) {
      throw new ForbiddenException(
        'Request must originate from trusted internal service with valid x-internal-secret',
      );
    }

    if (!ids) return [];
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const workerIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => uuidRegex.test(id))
      .slice(0, 100); // Giới hạn tối đa 100 IDs

    return this.userTrustService.getWorkersBatchSummary(workerIds);
  }
}


