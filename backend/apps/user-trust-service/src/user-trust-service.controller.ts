import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
  Param,
  Patch,
  Query,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
  Headers
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from '@app/cloudinary';
import { InternalServiceGuard } from './common/guards/internal-service.guard.js';
import { ConfigService } from '@app/config';
import {
  Ctx,
  EventPattern,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { ListUsersDto } from './dto/list-users.dto.js';
import { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import { ListWorkerReviewsDto } from './dto/list-worker-reviews.dto.js';


import crypto from 'node:crypto';

@ApiTags('User & Trust')
@Controller()
export class UserTrustServiceController {
  constructor(
    private readonly userTrustService: UserTrustServiceService,
    private readonly config: ConfigService,
    @Optional()
    private readonly cloudinaryService?: CloudinaryService,
  ) {}

  private readonly logger = new Logger(UserTrustServiceController.name);

  @Post('internal/users/verify-bank-account')
  @HttpCode(HttpStatus.OK)
  async verifyBankAccount(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { userId?: string; bankAccountId?: string },
  ): Promise<{ owned: boolean; active: boolean }> {
    this.assertInternalSecret(secret);
    if (!body?.userId || !body.bankAccountId) {
      throw new BadRequestException('userId and bankAccountId are required');
    }
    return this.userTrustService.verifyBankAccountOwnership(
      body.userId,
      body.bankAccountId,
    );
  }

  private assertInternalSecret(secret?: string): void {
    const expected = this.config.internalServiceSecret;
    if (
      !expected ||
      !secret ||
      secret.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    ) {
      throw new ForbiddenException('Trusted service authentication required');
    }
  }

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
      return await this.userTrustService.getUserAuthStatus(
        data.userId,
        data.roles,
      );
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
  async getMyProfile(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
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
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'avatar', maxCount: 1 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ tài khoản đang đăng nhập (hỗ trợ đổi tên, bio, avatarUrl hoặc upload trực tiếp ảnh)' })
  @ApiResponse({ status: 200, description: 'Cập nhật hồ sơ thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập' })
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      avatar?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    const avatarFile = files?.file?.[0] || files?.avatar?.[0];
    if (avatarFile && this.cloudinaryService) {
      const upload = await this.cloudinaryService.uploadImage(avatarFile);
      dto.avatarUrl = upload.url;
    }
    return this.userTrustService.updateProfile(
      user.userId,
      user.userId,
      dto,
      user.permissions,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('users/me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'avatar', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload và cập nhật ảnh đại diện (avatar)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File hình ảnh đại diện (JPEG, PNG, WebP)',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Cập nhật avatar thành công' })
  async uploadMyAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      avatar?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    const avatarFile = files?.file?.[0] || files?.avatar?.[0];
    if (!avatarFile) {
      throw new BadRequestException(
        'Vui lòng chọn file hình ảnh avatar (trường `file` hoặc `avatar`)',
      );
    }
    return this.userTrustService.uploadAvatar(user.userId, avatarFile);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('users/me/bank-accounts')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách tài khoản ngân hàng của tôi' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách tài khoản ngân hàng thành công' })
  async getMyBankAccounts(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.userTrustService.getBankAccounts(user.userId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('users/me/bank-accounts')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm tài khoản ngân hàng mới' })
  @ApiResponse({ status: 201, description: 'Thêm tài khoản ngân hàng thành công' })
  async addMyBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBankAccountDto,
  ): Promise<unknown> {
    return this.userTrustService.addBankAccount(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Delete('users/me/bank-accounts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa tài khoản ngân hàng' })
  @ApiResponse({ status: 200, description: 'Xóa tài khoản ngân hàng thành công' })
  async deleteMyBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') accountId: string,
  ): Promise<unknown> {
    return this.userTrustService.deleteBankAccount(user.userId, accountId);
  }

    @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_READ)
  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách người dùng (Dành cho Quản trị viên)',
    description:
      'Hỗ trợ phân trang, tìm kiếm theo họ tên/ID và lọc theo vai trò (customer, worker, all).',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách người dùng thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền Admin (cần user:read)' })
  async listUsers(@Query() query: ListUsersDto): Promise<unknown> {
    return this.userTrustService.listUsers(query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_READ)
  @Get('admin/users')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách người dùng (Dành cho Quản trị viên - URL alias)',
    description:
      'Hỗ trợ phân trang, tìm kiếm theo họ tên/ID và lọc theo vai trò (customer, worker, all).',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách người dùng thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền Admin (cần user:read)' })
  async listAdminUsers(@Query() query: ListUsersDto): Promise<unknown> {
    return this.userTrustService.listUsers(query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ theo ID người dùng' })
  @ApiResponse({ status: 200, description: 'Lấy hồ sơ thành công' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền xem hồ sơ người khác',
  })
  async getUserProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userTrustService.getProfile(user.userId, id, user.permissions);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xem hồ sơ chi tiết của thợ (Public Worker Profile)',
    description:
      'Dành cho khách hàng khi xem gợi ý từ AI Matching hoặc nhận báo giá từ Bidding. ' +
      'Bao gồm thông tin cá nhân, bio, số sao trung bình, phân bố đánh giá, danh sách dịch vụ và các nhận xét gần nhất.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID hồ sơ thợ (workerProfileId) hoặc ID người dùng (userId)',
  })
  @ApiResponse({ status: 200, description: 'Lấy thông tin profile thợ thành công' })
  @ApiResponse({ status: 400, description: 'ID thợ không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getWorkerProfile(@Param('id') id: string): Promise<unknown> {
    return this.userTrustService.getWorkerPublicProfile(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/:id/profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xem hồ sơ chi tiết của thợ (URL alias /profile)',
    description: 'Bao gồm thông tin cá nhân, bio, đánh giá sao, dịch vụ và nhận xét gần đây.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID hồ sơ thợ (workerProfileId) hoặc ID người dùng (userId)',
  })
  @ApiResponse({ status: 200, description: 'Lấy thông tin profile thợ thành công' })
  @ApiResponse({ status: 400, description: 'ID thợ không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getWorkerProfileAlias(@Param('id') id: string): Promise<unknown> {
    return this.userTrustService.getWorkerPublicProfile(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/:id/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách đánh giá nhận xét của thợ có phân trang',
    description: 'Hỗ trợ phân trang và lọc nhận xét theo số sao (1-5 sao).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID hồ sơ thợ (workerProfileId) hoặc ID người dùng (userId)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nhận xét thành công' })
  @ApiResponse({ status: 400, description: 'ID thợ không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getWorkerReviews(
    @Param('id') id: string,
    @Query() query: ListWorkerReviewsDto,
  ): Promise<unknown> {
    return this.userTrustService.getWorkerReviews(id, query);
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
   * Internal REST API for Matching Service candidate discovery.
   * GET /internal/v1/workers/candidates?serviceId=...&latitude=...&longitude=...&customerUserId=...
   */
  @Public()
  @UseGuards(InternalServiceGuard)
  @Get('internal/v1/workers/candidates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Internal: Find eligible worker candidates for matching',
  })
  async findWorkerCandidates(
    @Query('serviceId') serviceId: string,
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('customerUserId') customerUserId?: string,
  ): Promise<unknown> {
    return this.userTrustService.findWorkerCandidates({
      serviceId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      customerUserId,
    });
  }

  /**
   * Internal RabbitMQ RPC to discover eligible worker candidates.
   */
  @MessagePattern('workers.find-candidates')
  async findWorkerCandidatesRpc(
    @Payload()
    data: {
      serviceId: string;
      latitude: number;
      longitude: number;
      customerUserId?: string;
    },
    @Ctx() context?: any,
  ): Promise<unknown> {
    try {
      return await this.userTrustService.findWorkerCandidates(data);
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
   * Internal REST API for worker matching profile lookup (offerings, areas, verification).
   */
  @Public()
  @UseGuards(InternalServiceGuard)
  @Get('internal/v1/workers/:id/matching-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Internal: Get worker match profile for request discovery',
  })
  async getWorkerMatchProfile(
    @Param('id') workerUserId: string,
  ): Promise<unknown> {
    return this.userTrustService.getWorkerMatchProfile(workerUserId);
  }

  /**
   * Internal RabbitMQ RPC for worker match profile lookup.
   */
  @MessagePattern('workers.get-matching-profile')
  async getWorkerMatchProfileRpc(
    @Payload() data: { workerUserId: string },
    @Ctx() context?: any,
  ): Promise<unknown> {
    try {
      return await this.userTrustService.getWorkerMatchProfile(
        data.workerUserId,
      );
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
   * Internal REST API for batch worker summary lookup (Bidding & Candidates enrichment).
   */
  @Public()
  @UseGuards(InternalServiceGuard)
  @Get('internal/workers/batch-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Internal: Batch summary of worker profiles',
  })
  async getWorkersBatchSummary(
    @Query('ids') ids?: string,
  ): Promise<unknown> {
    const list = ids ? ids.split(',').map((id) => id.trim()).filter(Boolean) : [];
    return this.userTrustService.getWorkersBatchSummary(list);
  }

  @Public()
  @UseGuards(InternalServiceGuard)
  @Get('internal/v1/workers/batch-summary')
  @HttpCode(HttpStatus.OK)
  async getWorkersBatchSummaryV1(
    @Query('ids') ids?: string,
  ): Promise<unknown> {
    const list = ids ? ids.split(',').map((id) => id.trim()).filter(Boolean) : [];
    return this.userTrustService.getWorkersBatchSummary(list);
  }
}


