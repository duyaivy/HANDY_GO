import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  PermissionsGuard,
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

import { SubmitKycDto } from './dto/submit-kyc.dto.js';

@ApiTags('User & Trust')
@Controller()
export class UserTrustServiceController {
  constructor(
    private readonly userTrustService: UserTrustServiceService,
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
  ): Promise<{ exists: boolean; status: string; isProvisioned: boolean }> {
    return this.userTrustService.getUserAuthStatus(data.userId, data.roles);
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
  @Get('users/me/kyc')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy trạng thái xác minh KYC hiện tại của tài khoản' })
  @ApiResponse({ status: 200, description: 'Lấy trạng thái KYC thành công' })
  async getMyKycStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.userTrustService.getMyKycStatus(user.userId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('users/me/kyc')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gửi hồ sơ xác minh KYC (Worker nộp giấy tờ)' })
  @ApiResponse({ status: 201, description: 'Hồ sơ KYC đã được tiếp nhận' })
  async submitMyKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitKycDto,
  ): Promise<unknown> {
    return this.userTrustService.submitKyc(user.userId, dto);
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
}


