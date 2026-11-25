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
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
  Headers,
  ParseUUIDPipe,
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
  ApiHeader,
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
import { UserDisplayNamesQueryDto } from './dto/user-display-names-query.dto.js';
import {
  buildSuccessResponse,
  EVENT_PATTERNS,
  type DomainEvent,
} from '@app/common';
import { RABBITMQ_QUEUES } from '@app/rabbitmq';
import {
  UserTrustServiceService,
  isTransientEventError,
  type UserRegisteredData,
} from './user-trust-service.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import { ListWorkerReviewsDto } from './dto/list-worker-reviews.dto.js';
import { CreateReviewDto, UpdateReviewDto } from './dto/create-review.dto.js';
import { SubmitWorkerRegistrationDto } from './dto/submit-worker-registration.dto.js';
import { ListWorkerRegistrationsDto } from './dto/list-worker-registrations.dto.js';
import { ReviewWorkerRegistrationDto } from './dto/review-worker-registration.dto.js';
import { UpdateServiceOfferingDto } from './dto/update-service-offering.dto.js';


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

  @Public()
  @UseGuards(InternalServiceGuard)
  @Get('internal/users/display-names')
  async getDisplayNames(@Query() query: UserDisplayNamesQueryDto) {
    return buildSuccessResponse(
      await this.userTrustService.getDisplayNames(query.ids),
      'Public display names',
    );
  }

  private readonly logger = new Logger(UserTrustServiceController.name);

  @Public()
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

  private readonly MAX_EVENT_RETRIES = 3;

  private async publishToBrokerQueue(
    channel: any,
    queueName: string,
    originalMsg: any,
    event: unknown,
    headers: Record<string, unknown>,
    queueArgs?: Record<string, unknown>,
  ): Promise<boolean> {
    if (
      !channel ||
      typeof channel.assertQueue !== 'function' ||
      typeof channel.sendToQueue !== 'function'
    ) {
      return false;
    }
    try {
      await channel.assertQueue(
        queueName,
        queueArgs ? { durable: true, arguments: queueArgs } : { durable: true },
      );
      const rawContent =
        originalMsg?.content instanceof Buffer
          ? originalMsg.content
          : Buffer.from(JSON.stringify(event ?? {}));
      const existingProps = originalMsg?.properties ?? {};
      const sent = channel.sendToQueue(queueName, rawContent, {
        ...existingProps,
        persistent: true,
        headers: {
          ...(existingProps.headers ?? {}),
          ...headers,
        },
      });
      if (sent === false) {
        return false;
      }
      if (typeof channel.waitForConfirms === 'function') {
        await channel.waitForConfirms();
      }
      return true;
    } catch (publishErr) {
      this.logger.error(
        `Failed to publish message to ${queueName}: ${(publishErr as Error).message}`,
      );
      return false;
    }
  }

  private async processOrderEventWithRetry(
    eventType: 'order.completed' | 'order.created',
    event: DomainEvent<any>,
    context: any,
    handler: (evt: DomainEvent<any>) => Promise<{ processed: boolean; idempotent: boolean }>,
  ) {
    const rawData = (event as any)?.data ?? (event as any)?.payload ?? event;
    const workerUserId =
      rawData?.workerUserId ?? rawData?.workerId ?? (event as any)?.workerUserId;
    const orderId = rawData?.orderId ?? (event as any)?.orderId;

    const channel =
      context && typeof context.getChannelRef === 'function'
        ? context.getChannelRef()
        : null;
    const originalMsg =
      context && typeof context.getMessage === 'function'
        ? context.getMessage()
        : null;

    const existingHeaders = originalMsg?.properties?.headers ?? {};
    const previousAttempts = Number(existingHeaders['x-retry-count'] ?? 0) || 0;
    const mainQueue = RABBITMQ_QUEUES.USER_TRUST;
    const dlqQueue = `${mainQueue}.dlq`;

    if (!workerUserId || !orderId) {
      this.logger.warn(
        `Rejected malformed ${eventType} event: missing workerUserId or orderId (orderId=${orderId}, workerUserId=${workerUserId}). Moving to DLQ.`,
      );
      if (channel && originalMsg) {
        const dlqPublished = await this.publishToBrokerQueue(
          channel,
          dlqQueue,
          originalMsg,
          event,
          {
            'x-event-type': eventType,
            'x-last-error': 'MALFORMED_PAYLOAD',
            'x-failed-at': new Date().toISOString(),
          },
        );
        if (dlqPublished) {
          channel.ack(originalMsg);
        } else {
          channel.nack(originalMsg, false, false);
        }
      }
      return { processed: false, reason: 'MALFORMED_PAYLOAD' };
    }

    try {
      const result = await handler(event);
      if (channel && originalMsg) {
        channel.ack(originalMsg);
      }
      return result;
    } catch (err) {
      const errMsg = (err as Error).message;
      const isTransient = isTransientEventError(err);
      const nextAttempt = previousAttempts + 1;

      if (isTransient && nextAttempt <= this.MAX_EVENT_RETRIES) {
        const delay = process.env.NODE_ENV === 'test' ? 10 : 300 * nextAttempt;
        this.logger.warn(
          `Transient error handling ${eventType} for order ${orderId} (attempt ${nextAttempt}/${this.MAX_EVENT_RETRIES}): ${errMsg}. Republishing to retry queue (${delay}ms)...`,
        );
        const retryQueue = `${mainQueue}.retry.${nextAttempt}`;
        const retryPublished = await this.publishToBrokerQueue(
          channel,
          retryQueue,
          originalMsg,
          event,
          {
            'x-retry-count': nextAttempt,
            'x-event-type': eventType,
            'x-last-error': errMsg,
          },
          {
            'x-message-ttl': delay,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': mainQueue,
          },
        );
        if (channel && originalMsg) {
          if (retryPublished) {
            channel.ack(originalMsg);
          } else {
            await new Promise((resolve) => setTimeout(resolve, delay));
            channel.nack(originalMsg, false, true);
          }
        }
      } else {
        this.logger.error(
          `Permanent error or retries exhausted for ${eventType} (attempt ${nextAttempt}/${this.MAX_EVENT_RETRIES}): ${errMsg}. Persisting to DLQ.`,
        );
        const dlqPublished = await this.publishToBrokerQueue(
          channel,
          dlqQueue,
          originalMsg,
          event,
          {
            'x-retry-count': nextAttempt,
            'x-event-type': eventType,
            'x-last-error': errMsg,
            'x-failed-at': new Date().toISOString(),
          },
        );
        const dbRecorded = await this.userTrustService.recordDeadLetter(
          eventType,
          event,
          errMsg,
          nextAttempt,
        );
        if (channel && originalMsg) {
          if (dlqPublished || dbRecorded) {
            channel.ack(originalMsg);
          } else {
            this.logger.error(
              `Dead-letter persistence failed on both broker and DB for ${eventType}; requeueing message to prevent data loss.`,
            );
            channel.nack(originalMsg, false, true);
          }
        }
      }
      throw err;
    }
  }

  /**
   * RabbitMQ Event Consumer for 'order.completed'.
   * Synchronizes worker completed order count and total order count in WorkerProfile.
   */
  @EventPattern(EVENT_PATTERNS.ORDER_COMPLETED)
  async handleOrderCompleted(
    @Payload() event: DomainEvent<any>,
    @Ctx() context: any,
  ): Promise<unknown> {
    return this.processOrderEventWithRetry(
      'order.completed',
      event,
      context,
      (evt) => this.userTrustService.handleOrderCompleted(evt),
    );
  }

  /**
   * RabbitMQ Event Consumer for 'order.created'.
   * Synchronizes worker total order count in WorkerProfile.
   */
  @EventPattern(EVENT_PATTERNS.ORDER_CREATED)
  async handleOrderCreated(
    @Payload() event: DomainEvent<any>,
    @Ctx() context: any,
  ): Promise<unknown> {
    return this.processOrderEventWithRetry(
      'order.created',
      event,
      context,
      (evt) => this.userTrustService.handleOrderCreated(evt),
    );
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
  @Get('users/:id/worker-profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ công khai của thợ theo workerUserId' })
  @ApiResponse({ status: 200, description: 'Lấy hồ sơ thợ thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy thợ' })
  async getWorkerPublicProfile(
    @Param('id') workerUserId: string,
  ): Promise<unknown> {
    return this.userTrustService.getWorkerOrderSummary(workerUserId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('users/workers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ công khai của thợ theo workerUserId (alias)' })
  @ApiResponse({ status: 200, description: 'Lấy hồ sơ thợ thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy thợ' })
  async getWorkerPublicProfileAlias(
    @Param('id') workerUserId: string,
  ): Promise<unknown> {
    return this.userTrustService.getWorkerOrderSummary(workerUserId);
  }

  // ==========================================
  // WORKER SERVICE & AREA REGISTRATION (WORKER)
  // ==========================================

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('workers/me/service-registrations')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Khóa chống gửi trùng lặp yêu cầu khi mạng lag hoặc chập chờn',
  })
  @ApiOperation({
    summary: 'Thợ nộp đơn đăng ký dịch vụ làm việc và khu vực hoạt động',
    description:
      'Thợ chọn danh mục, dịch vụ thuộc danh mục, tọa độ và bán kính tìm việc, kèm ảnh/video minh chứng gửi admin duyệt. Hỗ trợ Idempotency-Key chống gửi trùng lặp.',
  })
  @ApiResponse({ status: 201, description: 'Nộp đơn đăng ký dịch vụ thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc dịch vụ không tồn tại trong danh mục' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  async submitMyServiceRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitWorkerRegistrationDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Headers('x-idempotency-key') xIdempotencyKeyHeader?: string,
  ): Promise<unknown> {
    const effectiveKey =
      idempotencyKeyHeader || xIdempotencyKeyHeader || dto.idempotencyKey;
    return this.userTrustService.submitWorkerServiceRegistration(
      user.userId,
      dto,
      effectiveKey,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Put('workers/me/service-registrations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Khóa chống gửi trùng lặp yêu cầu khi mạng lag hoặc chập chờn',
  })
  @ApiOperation({
    summary: 'Thợ cập nhật đơn đăng ký dịch vụ (hoặc nộp lại đơn từ đơn bị từ chối)',
    description:
      'Nếu đơn đang chờ duyệt (pending): Cập nhật trực tiếp nội dung đơn đó. ' +
      'Nếu đơn đã bị từ chối (rejected): Tạo một đơn mới (pending) để Admin duyệt lại và giữ nguyên đơn cũ làm lịch sử đối soát.',
  })
  @ApiParam({ name: 'id', description: 'ID đơn đăng ký dịch vụ cần sửa (UUID)' })
  @ApiResponse({ status: 200, description: 'Cập nhật đơn đăng ký thành công' })
  @ApiResponse({ status: 201, description: 'Nộp lại đơn mới thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc đơn đã được duyệt' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn đăng ký' })
  async updateMyServiceRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SubmitWorkerRegistrationDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Headers('x-idempotency-key') xIdempotencyKeyHeader?: string,
  ): Promise<unknown> {
    const effectiveKey =
      idempotencyKeyHeader || xIdempotencyKeyHeader || dto.idempotencyKey;
    return this.userTrustService.updateWorkerServiceRegistration(
      user.userId,
      id,
      dto,
      effectiveKey,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/me/service-registrations')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thợ xem lịch sử và trạng thái các đơn đăng ký dịch vụ của mình',
    description: 'Bao gồm trạng thái pending, approved, rejected kèm lý do từ chối nếu có.',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách đơn đăng ký thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  async getMyServiceRegistrations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.userTrustService.getMyServiceRegistrations(user.userId);
  }

  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Delete('workers/me/service-registrations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thợ hủy đơn đăng ký dịch vụ đang chờ duyệt',
    description: 'Chỉ có thể hủy đơn đăng ký khi đơn đang ở trạng thái pending (chờ duyệt).',
  })
  @ApiParam({ name: 'id', description: 'ID đơn đăng ký dịch vụ cần hủy (UUID)' })
  @ApiResponse({ status: 200, description: 'Hủy đơn đăng ký dịch vụ thành công' })
  @ApiResponse({ status: 400, description: 'Đơn không ở trạng thái pending' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn đăng ký' })
  async cancelMyServiceRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.userTrustService.cancelWorkerServiceRegistration(
      user.userId,
      id,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Patch('workers/me/service-offerings/:offeringId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bật/tắt hoặc cập nhật trạng thái hoạt động của một dịch vụ đã duyệt',
    description: 'Cho phép thợ chủ động tạm dừng hoặc tiếp tục nhận việc cho dịch vụ cụ thể.',
  })
  @ApiParam({ name: 'offeringId', description: 'ID của WorkerServiceOffering (UUID)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái dịch vụ thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ hoặc dịch vụ' })
  async updateServiceOffering(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offeringId', new ParseUUIDPipe({ version: '4' })) offeringId: string,
    @Body() dto: UpdateServiceOfferingDto,
  ): Promise<unknown> {
    return this.userTrustService.updateServiceOffering(
      user.userId,
      offeringId,
      dto.isActive,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Patch('workers/me/service-offerings/:offeringId/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đảo trạng thái hoạt động (bật/tắt) của một dịch vụ đã duyệt',
  })
  @ApiParam({ name: 'offeringId', description: 'ID của WorkerServiceOffering (UUID)' })
  @ApiResponse({ status: 200, description: 'Đảo trạng thái dịch vụ thành công' })
  async toggleServiceOffering(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offeringId', new ParseUUIDPipe({ version: '4' })) offeringId: string,
  ): Promise<unknown> {
    return this.userTrustService.updateServiceOffering(
      user.userId,
      offeringId,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/geocode')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chuyển đổi địa chỉ sang tọa độ vĩ độ (lat) và kinh độ (long)',
    description: 'Hỗ trợ thợ nhập địa chỉ để hệ thống tự động xác định lat và long.',
  })
  @ApiResponse({ status: 200, description: 'Lấy tọa độ thành công' })
  @ApiResponse({ status: 400, description: 'Chưa nhập địa chỉ' })
  async geocodeAddress(
    @Query('address') address: string,
  ): Promise<unknown> {
    return this.userTrustService.geocodeAddress(address);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('workers/me/evidence-upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'evidence', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload hình ảnh minh chứng năng lực dịch vụ lên Cloudinary',
  })
  @ApiResponse({ status: 200, description: 'Upload file minh chứng thành công' })
  @ApiResponse({ status: 400, description: 'File không hợp lệ hoặc để trống' })
  async uploadEvidenceFile(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      evidence?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    const file = files?.file?.[0] || files?.evidence?.[0];
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh minh chứng (trường `file` hoặc `evidence`)');
    }
    return this.userTrustService.uploadEvidenceFile(user.userId, file);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('workers/me/video-upload-signature')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Khởi tạo chữ ký direct upload video minh chứng lên Cloudinary',
  })
  @ApiResponse({ status: 200, description: 'Khởi tạo chữ ký thành công' })
  @ApiResponse({ status: 400, description: 'Thông số video không hợp lệ' })
  async createEvidenceVideoSignature(
    @Body()
    dto: {
      fileName?: string;
      mimeType: string;
      fileSize: number;
      checksumSha256?: string;
    },
  ): Promise<unknown> {
    return this.userTrustService.createEvidenceVideoSignature(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/me/profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thợ tự xem hồ sơ chi tiết của chính mình',
    description: 'Hiển thị thông tin cá nhân, bio, số sao trung bình, phân bố đánh giá, dịch vụ và các nhận xét gần nhất.',
  })
  @ApiResponse({ status: 200, description: 'Lấy thông tin profile thợ thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getMyWorkerProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.userTrustService.getWorkerPublicProfile('me', user.userId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/me/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thợ tự xem tất cả đánh giá nhận xét của chính mình (bất kỳ đơn nào)',
    description: 'Hiển thị danh sách tất cả đánh giá từ mọi đơn hàng kèm thống kê sao, bình luận, phân trang và ảnh/video đính kèm.',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nhận xét thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getMyWorkerReviews(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkerReviewsDto,
  ): Promise<unknown> {
    return this.userTrustService.getWorkerReviews('me', query, user.userId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xem hồ sơ chi tiết của thợ (Public Worker Profile)',
    description:
      'Dành cho khách hàng khi xem gợi ý từ AI Matching hoặc nhận báo giá từ Bidding, hoặc thợ tự xem. ' +
      'Bao gồm thông tin cá nhân, bio, số sao trung bình, phân bố đánh giá, danh sách dịch vụ và các nhận xét gần nhất.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID hồ sơ thợ (workerProfileId), ID người dùng (userId), hoặc "me"',
  })
  @ApiResponse({ status: 200, description: 'Lấy thông tin profile thợ thành công' })
  @ApiResponse({ status: 400, description: 'ID thợ không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getWorkerProfile(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<unknown> {
    return user?.userId
      ? this.userTrustService.getWorkerPublicProfile(id, user.userId)
      : this.userTrustService.getWorkerPublicProfile(id);
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
    description: 'ID hồ sơ thợ (workerProfileId), ID người dùng (userId), hoặc "me"',
  })
  @ApiResponse({ status: 200, description: 'Lấy thông tin profile thợ thành công' })
  @ApiResponse({ status: 400, description: 'ID thợ không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getWorkerProfileAlias(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<unknown> {
    return user?.userId
      ? this.userTrustService.getWorkerPublicProfile(id, user.userId)
      : this.userTrustService.getWorkerPublicProfile(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('workers/:id/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xem tất cả đánh giá của thợ qua đấu giá hoặc hồ sơ thợ (bất kỳ đơn nào)',
    description: 'Khách hàng xem danh sách đánh giá của thợ (theo workerProfileId, userId hoặc "me" nếu thợ tự xem). Hỗ trợ phân trang, lọc theo số sao (1-5 sao), thống kê rating tổng quan và đính kèm hình ảnh/video.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID hồ sơ thợ (workerProfileId), ID người dùng (userId), hoặc "me"',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nhận xét thành công' })
  @ApiResponse({ status: 400, description: 'ID thợ không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hồ sơ thợ' })
  async getWorkerReviews(
    @Param('id') id: string,
    @Query() query: ListWorkerReviewsDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<unknown> {
    return user?.userId
      ? this.userTrustService.getWorkerReviews(id, query, user.userId)
      : this.userTrustService.getWorkerReviews(id, query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('reviews/workers/:workerId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xem tất cả đánh giá của thợ theo workerId (URL alias)',
    description: 'Alias của /workers/:id/reviews phục vụ khách hàng xem đánh giá thợ trong luồng đấu giá hoặc hồ sơ thợ.',
  })
  @ApiParam({
    name: 'workerId',
    description: 'ID hồ sơ thợ (workerProfileId), ID người dùng (userId), hoặc "me"',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nhận xét thành công' })
  async getWorkerReviewsAlias(
    @Param('workerId') workerId: string,
    @Query() query: ListWorkerReviewsDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<unknown> {
    return user?.userId
      ? this.userTrustService.getWorkerReviews(workerId, query, user.userId)
      : this.userTrustService.getWorkerReviews(workerId, query);
  }

  // ==========================================
  // ORDER REVIEWS (CUSTOMER REVIEW WORKER)
  // ==========================================

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('reviews')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 5 },
      { name: 'videos', maxCount: 2 },
      { name: 'file', maxCount: 5 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đánh giá đơn hàng (số sao, nhận xét mô tả, hình ảnh video)',
    description:
      'Khách hàng đánh giá thợ sau khi đơn hàng hoàn thành. Hỗ trợ số sao (1-5), nhận xét, danh sách media URL hoặc upload ảnh trực tiếp qua multipart file. Lưu ý: Video không tải trực tiếp qua multipart mà cần dùng POST /reviews/video-upload-signature và gửi URL qua mảng media.',
  })
  @ApiResponse({ status: 201, description: 'Đánh giá đơn hàng thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc đơn hàng chưa hoàn thành' })
  @ApiResponse({ status: 403, description: 'Không có quyền đánh giá đơn hàng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn hàng hoặc thợ' })
  @ApiResponse({ status: 409, description: 'Đơn hàng này đã được đánh giá' })
  async createReview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    return this.userTrustService.createReview(user.userId, dto, undefined, files);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('orders/:orderId/reviews')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 5 },
      { name: 'videos', maxCount: 2 },
      { name: 'file', maxCount: 5 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đánh giá đơn hàng theo orderId trên URL',
  })
  async createOrderReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: CreateReviewDto,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    return this.userTrustService.createReview(user.userId, dto, orderId, files);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('reviews/orders/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy thông tin đánh giá theo mã đơn hàng',
    description: 'Trả về đánh giá published cho mọi người dùng có quyền. Đánh giá bị ẩn/gỡ chỉ hiển thị cho khách hàng sở hữu, thợ, hoặc admin.',
  })
  @ApiResponse({ status: 200, description: 'Lấy đánh giá thành công' })
  @ApiResponse({ status: 404, description: 'Đơn hàng chưa có đánh giá' })
  async getReviewByOrderId(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ): Promise<unknown> {
    return this.userTrustService.getReviewByOrderId(orderId, caller);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('orders/:orderId/review')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy thông tin đánh giá theo mã đơn hàng (alias)',
  })
  async getOrderReviewAlias(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ): Promise<unknown> {
    return this.userTrustService.getReviewByOrderId(orderId, caller);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('reviews/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy chi tiết đánh giá theo ID nhận xét',
    description: 'Trả về đánh giá published cho mọi người dùng có quyền. Đánh giá bị ẩn/gỡ chỉ hiển thị cho khách hàng sở hữu, thợ, hoặc admin.',
  })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết đánh giá thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đánh giá' })
  async getReviewById(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.userTrustService.getReviewById(id, caller);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Put('reviews/:id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 5 },
      { name: 'videos', maxCount: 2 },
      { name: 'file', maxCount: 5 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chỉnh sửa đánh giá (cho phép sửa 1 lần duy nhất trong vòng 48h)',
    description:
      'Khách hàng có thể cập nhật số sao, nhận xét hoặc hình ảnh/video của đánh giá trong vòng 48 giờ kể từ khi tạo. Chỉ được sửa 1 lần duy nhất. Hỗ trợ upload ảnh qua multipart, video phải dùng direct upload signature và truyền URL qua mảng media.',
  })
  @ApiResponse({ status: 200, description: 'Chỉnh sửa đánh giá thành công' })
  @ApiResponse({
    status: 400,
    description: 'Đã quá hạn 48h hoặc đánh giá đã được chỉnh sửa trước đó',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền chỉnh sửa đánh giá này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đánh giá' })
  async updateReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateReviewDto,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    return this.userTrustService.updateReview(user.userId, id, dto, files);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Patch('reviews/:id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 5 },
      { name: 'videos', maxCount: 2 },
      { name: 'file', maxCount: 5 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chỉnh sửa đánh giá theo reviewId (PATCH alias)',
  })
  async patchReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateReviewDto,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    return this.userTrustService.updateReview(user.userId, id, dto, files);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Put('orders/:orderId/reviews')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 5 },
      { name: 'videos', maxCount: 2 },
      { name: 'file', maxCount: 5 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chỉnh sửa đánh giá theo orderId',
  })
  async updateOrderReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: UpdateReviewDto,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    return this.userTrustService.updateReview(user.userId, orderId, dto, files);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Patch('orders/:orderId/reviews')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 5 },
      { name: 'videos', maxCount: 2 },
      { name: 'file', maxCount: 5 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chỉnh sửa đánh giá theo orderId (PATCH alias)',
  })
  async patchOrderReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: UpdateReviewDto,
    @UploadedFiles()
    files?: {
      file?: Express.Multer.File[];
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    return this.userTrustService.updateReview(user.userId, orderId, dto, files);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post('reviews/video-upload-signature')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Khởi tạo chữ ký direct upload video nhận xét đánh giá lên Cloudinary',
  })
  @ApiResponse({ status: 200, description: 'Khởi tạo chữ ký thành công' })
  @ApiResponse({ status: 400, description: 'Thông số video không hợp lệ' })
  async createReviewVideoSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    dto: {
      fileName?: string;
      mimeType: string;
      fileSize?: number;
    },
  ): Promise<unknown> {
    if (!dto.mimeType || !dto.mimeType.startsWith('video/')) {
      throw new BadRequestException('mimeType phải là định dạng video hợp lệ');
    }
    return this.userTrustService.createReviewVideoSignature(user.userId, dto);
  }

  // ==========================================
  // WORKER SERVICE REGISTRATION REVIEW (ADMIN)
  // ==========================================

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Get('admin/worker-registrations')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin lấy danh sách đơn đăng ký dịch vụ của các thợ',
    description: 'Hỗ trợ phân trang, lọc theo trạng thái (pending, approved, rejected), tìm kiếm theo tên hoặc địa chỉ.',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách đơn đăng ký thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền truy cập (yêu cầu user:manage)' })
  async listAdminServiceRegistrations(
    @Query() query: ListWorkerRegistrationsDto,
  ): Promise<unknown> {
    return this.userTrustService.listAdminServiceRegistrations(query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Get('admin/worker-registrations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin xem chi tiết một đơn đăng ký dịch vụ của thợ',
    description: 'Xem đầy đủ danh mục, danh sách dịch vụ, khu vực hoạt động, và các hình ảnh/video minh chứng.',
  })
  @ApiParam({ name: 'id', description: 'ID đơn đăng ký dịch vụ (UUID)' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết đơn đăng ký thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn đăng ký' })
  async getAdminServiceRegistrationDetail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.userTrustService.getAdminServiceRegistrationDetail(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.USER_MANAGE)
  @Post('admin/worker-registrations/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin phê duyệt hoặc từ chối đơn đăng ký dịch vụ của thợ',
    description:
      'Nếu duyệt: kích hoạt các dịch vụ vào hồ sơ thợ và thiết lập khu vực làm việc. Nếu từ chối: yêu cầu nhập lý do từ chối.',
  })
  @ApiParam({ name: 'id', description: 'ID đơn đăng ký dịch vụ (UUID)' })
  @ApiResponse({ status: 200, description: 'Phê duyệt hoặc từ chối đơn thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc thiếu lý do từ chối' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn đăng ký' })
  async reviewServiceRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReviewWorkerRegistrationDto,
  ): Promise<unknown> {
    return this.userTrustService.reviewServiceRegistration(
      user.userId,
      id,
      dto,
    );
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


