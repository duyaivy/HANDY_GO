import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { ReviewKycDto } from './dto/review-kyc.dto.js';

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
   * ADMIN API: List pending/processed KYC cases.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Get('users/admin/kyc-cases')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Danh sách các hồ sơ KYC chờ duyệt hoặc đã duyệt' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái (submitted, reviewing, approved, rejected)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listKycCases(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<unknown> {
    return this.userTrustService.listKycCases(status, page, limit);
  }

  /**
   * ADMIN API: Get details of a specific KYC case.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Get('users/admin/kyc-cases/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Chi tiết hồ sơ KYC (ảnh CCCD, selfie, điểm đối sánh AI)' })
  async getKycCaseDetail(
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userTrustService.getKycCase(id);
  }

  /**
   * ADMIN API: Approve or reject a KYC case.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Patch('users/admin/kyc-cases/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Phê duyệt hoặc từ chối hồ sơ KYC' })
  async reviewKycCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewKycDto,
  ): Promise<unknown> {
    return this.userTrustService.reviewKycCase(
      user.userId,
      id,
      dto.decision,
      dto.note,
    );
  }
}

