import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { RabbitMQService } from '@app/rabbitmq';
import { EVENT_PATTERNS } from '@app/common';
import { KycRepository } from './kyc.repository.js';
import type { SubmitKycDto } from './dto/submit-kyc.dto.js';
import type { ListKycCasesDto } from './dto/list-kyc-cases.dto.js';
import type { ReviewKycCaseDto } from './dto/review-kyc-case.dto.js';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly kycRepository: KycRepository,
    @Optional()
    private readonly rabbitmq?: RabbitMQService,
  ) {}

  /**
   * Submit a new KYC verification profile.
   * Creates KycCase & AiAnalysisJob, returns 202 Accepted immediately.
   */
  async submitKyc(
    userId: string,
    dto: SubmitKycDto,
    idempotencyKey?: string,
  ) {
    const effectiveKey = idempotencyKey || dto.idempotencyKey;

    // 1. Idempotency Check
    if (effectiveKey) {
      const existingJob = await this.kycRepository.findJobByIdempotencyKey(effectiveKey);
      if (existingJob) {
        this.logger.log(`Idempotent KYC submission detected for key ${effectiveKey}`);
        return {
          statusCode: HttpStatus.ACCEPTED,
          message: 'Yêu cầu xác minh KYC đã được tiếp nhận trước đó (Idempotent)',
          data: {
            kycCaseId: existingJob.kycCaseId,
            jobId: existingJob.id,
            status: existingJob.status,
            createdAt: existingJob.createdAt,
          },
        };
      }
    }

    // 2. Check if user already has an active submission currently being processed by AI
    const worker = await this.kycRepository.findWorkerByUserId(userId);
    if (worker && worker.kycCases.length > 0) {
      const latestCase = worker.kycCases[0];
      if (latestCase && latestCase.status === 'submitted') {
        const activeJob = latestCase.jobs?.[0];
        if (activeJob && (activeJob.status === 'pending' || activeJob.status === 'processing')) {
          const lastActiveTime = activeJob.updatedAt || activeJob.createdAt;
          const isRecent =
            !lastActiveTime ||
            Date.now() - new Date(lastActiveTime).getTime() < 120000;
          if (isRecent) {
            this.logger.log(`User ${userId} already has KYC job ${activeJob.id} in progress (${activeJob.status})`);
            return {
              statusCode: HttpStatus.ACCEPTED,
              message: 'Hồ sơ KYC đang trong quá trình AI phân tích',
              data: {
                kycCaseId: latestCase.id,
                jobId: activeJob.id,
                status: activeJob.status,
                createdAt: activeJob.createdAt,
              },
            };
          }
        }
      }
    }

    // 3. Create KycCase, AiAnalysisJob, KycReviewHistory, OutboxEvent in database transaction
    const result = await this.kycRepository.createKycCaseAndJob(
      userId,
      dto,
      effectiveKey,
    );

    // 4. Emit event to RabbitMQ for worker to process immediately
    if (this.rabbitmq) {
      try {
        await this.rabbitmq.emit(
          EVENT_PATTERNS.KYC_JOB_PROCESS,
          result.jobPayload,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to emit immediately to RabbitMQ (${(err as Error).message}). Outbox publisher will process.`,
        );
      }
    }

    this.logger.log(
      `KYC submitted successfully for user ${userId}. Case: ${result.kycCase.id}, Job: ${result.job.id}`,
    );

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'Hồ sơ KYC đã được tiếp nhận và đưa vào hàng đợi phân tích AI',
      data: {
        kycCaseId: result.kycCase.id,
        jobId: result.job.id,
        status: 'queued',
        createdAt: result.kycCase.createdAt,
      },
    };
  }

  /**
   * Get current user's KYC verification status.
   */
  async getMyKycStatus(userId: string) {
    const worker = await this.kycRepository.findWorkerByUserId(userId);

    if (!worker) {
      return {
        statusCode: HttpStatus.OK,
        data: {
          workerStatus: 'draft',
          latestKycCase: null,
          activeJob: null,
        },
      };
    }

    const latestCase = worker.kycCases[0] || null;
    const activeJob = latestCase?.jobs?.[0] || null;

    return {
      statusCode: HttpStatus.OK,
      data: {
        workerStatus: worker.status,
        latestKycCase: latestCase,
        activeJob,
      },
    };
  }

  /**
   * Check status of a specific AI analysis job.
   */
  async getKycJobStatus(userId: string, jobId: string) {
    const job = await this.kycRepository.findJobById(jobId);

    if (!job) {
      throw new NotFoundException(`Không tìm thấy công việc phân tích ID: ${jobId}`);
    }

    // Ensure the requesting user owns this job
    if (job.kycCase?.workerProfile?.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin công việc này.');
    }

    return {
      statusCode: HttpStatus.OK,
      data: {
        jobId: job.id,
        kycCaseId: job.kycCaseId,
        status: job.status,
        retryCount: job.retryCount,
        failureReason: job.failureReason,
        aiResult: job.aiResult,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      },
    };
  }

  /**
   * Admin API: List KYC cases with pagination and status filter.
   */
  async listAdminKycCases(query: ListKycCasesDto) {
    const result = await this.kycRepository.listKycCases(
      query.status,
      query.page,
      query.limit,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result.cases,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * Admin API: Get detailed KYC case and AI analysis result.
   */
  async getAdminKycCaseDetail(caseId: string) {
    const kycCase = await this.kycRepository.findCaseById(caseId);

    if (!kycCase) {
      throw new NotFoundException('Không tìm thấy hồ sơ KYC.');
    }

    return {
      statusCode: HttpStatus.OK,
      data: kycCase,
    };
  }

  /**
   * Admin API: Approve or reject a KYC case.
   */
  async reviewKycCase(
    adminUserId: string,
    caseId: string,
    dto: ReviewKycCaseDto,
  ) {
    try {
      const updatedCase = await this.kycRepository.reviewKycCaseByAdmin(
        adminUserId,
        caseId,
        dto.decision,
        dto.note,
      );

      const isApproved = dto.decision === 'approved';

      // Emit domain event for notifications / downstream services
      if (this.rabbitmq) {
        const pattern = isApproved
          ? EVENT_PATTERNS.KYC_COMPLETED
          : EVENT_PATTERNS.KYC_FAILED;

        await this.rabbitmq.emit(pattern, {
          kycCaseId: caseId,
          workerProfileId: updatedCase.workerProfileId,
          decision: dto.decision,
          reviewedBy: adminUserId,
          reviewedAt: new Date().toISOString(),
          note: dto.note,
        });
      }

      this.logger.log(
        `Admin ${adminUserId} reviewed KYC case ${caseId} with decision: ${dto.decision}`,
      );

      return {
        statusCode: HttpStatus.OK,
        message: isApproved
          ? 'Đã phê duyệt hồ sơ KYC thành công'
          : 'Đã từ chối hồ sơ KYC',
        data: updatedCase,
      };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException(err.message || 'Lỗi khi xử lý duyệt KYC');
    }
  }
}
