import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import {
  ApiBearerAuth,
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
  RequirePermissions,
  StandardPermissions,
  type AuthenticatedUser,
} from '@app/auth';
import { EVENT_PATTERNS, type DomainEvent } from '@app/common';
import { CloudinaryService } from '@app/cloudinary';
import { KycService } from './kyc.service.js';
import { KycWorkerService, type KycJobProcessPayload } from './kyc-worker.service.js';
import { SubmitKycDto } from './dto/submit-kyc.dto.js';
import { KycJobStatusResponseDto } from './dto/kyc-job-response.dto.js';

@ApiTags('KYC Verification')
@Controller('users/me/kyc')
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(
    private readonly kycService: KycService,
    private readonly kycWorkerService: KycWorkerService,
    @Optional()
    private readonly cloudinaryService?: CloudinaryService,
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_UPDATE)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'documentFront', maxCount: 1 },
      { name: 'documentBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
      { name: 'cccd_image', maxCount: 1 },
      { name: 'selfie_image', maxCount: 1 },
    ]),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gửi hồ sơ xác minh KYC (Worker nộp CCCD và ảnh selfie)',
    description:
      'Backend tiếp nhận hồ sơ, lưu database, đưa job vào hàng đợi RabbitMQ và trả kết quả 202 Accepted ngay lập tức. Hỗ trợ truyền JSON URL references hoặc upload trực tiếp qua multipart/form-data. Client có thể dùng jobId để kiểm tra tiến độ.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Khóa idempotency để chống gửi trùng lặp yêu cầu',
  })
  @ApiResponse({
    status: 202,
    description: 'Hồ sơ KYC đã được tiếp nhận và đưa vào hàng đợi AI xử lý',
  })
  async submitMyKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitKycDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
    @Headers('x-idempotency-key') xIdempotencyKeyHeader?: string,
    @UploadedFiles()
    files?: {
      documentFront?: Express.Multer.File[];
      documentBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
      cccd_image?: Express.Multer.File[];
      selfie_image?: Express.Multer.File[];
    },
  ): Promise<unknown> {
    const frontFile = files?.documentFront?.[0] || files?.cccd_image?.[0];
    const selfieFile = files?.selfie?.[0] || files?.selfie_image?.[0];
    const backFile = files?.documentBack?.[0];

    if (frontFile && this.cloudinaryService) {
      const upload = await this.cloudinaryService.uploadImage(frontFile);
      dto.documentFrontRef = upload.url;
    }
    if (selfieFile && this.cloudinaryService) {
      const upload = await this.cloudinaryService.uploadImage(selfieFile);
      dto.selfieRef = upload.url;
    }
    if (backFile && this.cloudinaryService) {
      const upload = await this.cloudinaryService.uploadImage(backFile);
      dto.documentBackRef = upload.url;
    }

    if (!dto.documentFrontRef) {
      throw new BadRequestException(
        'Ảnh mặt trước CCCD (documentFrontRef hoặc file upload) là bắt buộc',
      );
    }
    if (!dto.selfieRef) {
      throw new BadRequestException(
        'Ảnh chân dung selfie (selfieRef hoặc file upload) là bắt buộc',
      );
    }

    const idempotencyKey =
      idempotencyKeyHeader || xIdempotencyKeyHeader || dto.idempotencyKey;
    return this.kycService.submitKyc(user.userId, dto as any, idempotencyKey);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy trạng thái xác minh KYC hiện tại của tài khoản' })
  @ApiResponse({ status: 200, description: 'Lấy trạng thái KYC thành công' })
  async getMyKycStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.kycService.getMyKycStatus(user.userId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(StandardPermissions.PROFILE_READ)
  @Get('jobs/:jobId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra trạng thái tiến độ xử lý công việc AI (Polling)' })
  @ApiParam({ name: 'jobId', description: 'ID của công việc phân tích AI' })
  @ApiResponse({
    status: 200,
    description: 'Lấy trạng thái job thành công',
    type: KycJobStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy job' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập job này' })
  async getKycJobStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ): Promise<unknown> {
    return this.kycService.getKycJobStatus(user.userId, jobId);
  }

  /**
   * RabbitMQ Event Consumer for processing KYC AI jobs asynchronously.
   * Prefetch count is 1 for sequential execution.
   */
  @EventPattern(EVENT_PATTERNS.KYC_JOB_PROCESS)
  async handleKycJobProcess(
    @Payload() event: DomainEvent<KycJobProcessPayload> | KycJobProcessPayload,
    @Ctx() context: any,
  ): Promise<void> {
    await this.kycWorkerService.processKycJob(event, context);
  }
}
