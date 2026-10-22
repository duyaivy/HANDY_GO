import { Injectable, NotFoundException } from '@nestjs/common';
import crypto from 'node:crypto';
import { UserTrustPrismaService } from '@app/database';
import { EVENT_PATTERNS } from '@app/common';
import { KYC_CONSTANTS, maskIdNumber } from './kyc.constants.js';
import type { SubmitKycDto } from './dto/submit-kyc.dto.js';

@Injectable()
export class KycRepository {
  constructor(private readonly db: UserTrustPrismaService) {}

  async findWorkerByUserId(userId: string) {
    return this.db.workerProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        kycCases: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            jobs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
  }

  async findOrCreateWorker(userId: string) {
    const now = new Date();
    let worker = await this.db.workerProfile.findUnique({
      where: { userId },
    });

    if (!worker) {
      let user = await this.db.user.findUnique({ where: { id: userId } });
      if (!user) {
        user = await this.db.user.create({
          data: {
            id: userId,
            fullName: 'HandyGo Worker',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      worker = await this.db.workerProfile.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          status: 'pending_kyc',
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    return worker;
  }

  async findJobById(jobId: string) {
    return this.db.aiAnalysisJob.findUnique({
      where: { id: jobId },
      include: {
        kycCase: {
          include: {
            workerProfile: {
              include: { user: true },
            },
          },
        },
      },
    });
  }

  async findJobByIdempotencyKey(key: string) {
    return this.db.aiAnalysisJob.findUnique({
      where: { idempotencyKey: key },
      include: {
        kycCase: true,
      },
    });
  }

  async findCaseById(caseId: string) {
    return this.db.kycCase.findUnique({
      where: { id: caseId },
      include: {
        workerProfile: {
          include: { user: true },
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
        },
        reviewHistories: {
          orderBy: { createdAt: 'desc' },
        },
        reviewer: true,
      },
    });
  }

  async createKycCaseAndJob(
    userId: string,
    dto: SubmitKycDto,
    idempotencyKey?: string,
  ) {
    const now = new Date();
    const caseId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();

    return this.db.$transaction(
      async (tx) => {
        // 1. Ensure worker exists
        let worker = await tx.workerProfile.findUnique({
          where: { userId },
        });

        if (!worker) {
          let user = await tx.user.findUnique({ where: { id: userId } });
          if (!user) {
            user = await tx.user.create({
              data: {
                id: userId,
                fullName: 'HandyGo Worker',
                status: 'active',
                createdAt: now,
                updatedAt: now,
              },
            });
          }
          worker = await tx.workerProfile.create({
            data: {
              id: crypto.randomUUID(),
              userId,
              status: 'pending_kyc',
              createdAt: now,
              updatedAt: now,
            },
          });
        } else {
          worker = await tx.workerProfile.update({
            where: { id: worker.id },
            data: {
              status: 'pending_kyc',
              updatedAt: now,
            },
          });
        }

        const maskedId = dto.idNumber ? maskIdNumber(dto.idNumber) : null;

        // 2. Create KYC Case
        const kycCase = await tx.kycCase.create({
          data: {
            id: caseId,
            workerProfileId: worker.id,
            idDocumentType: dto.idDocumentType || 'CCCD',
            idNumberMasked: maskedId,
            documentFrontRef: dto.documentFrontRef,
            documentBackRef: dto.documentBackRef || null,
            selfieRef: dto.selfieRef,
            status: 'submitted',
            version: 1,
            idempotencyKey: idempotencyKey || null,
            activeJobId: jobId,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });

        // 3. Create AI Analysis Job
        const job = await tx.aiAnalysisJob.create({
          data: {
            id: jobId,
            kycCaseId: caseId,
            workerProfileId: worker.id,
            status: 'pending',
            retryCount: 0,
            maxRetries: KYC_CONSTANTS.DEFAULT_MAX_RETRIES,
            idempotencyKey: idempotencyKey || null,
            createdAt: now,
            updatedAt: now,
          },
        });

        // 4. Create Audit Review History entry
        await tx.kycReviewHistory.create({
          data: {
            id: historyId,
            kycCaseId: caseId,
            action: 'submitted',
            fromStatus: 'draft',
            toStatus: 'submitted',
            performedByUserId: userId,
            note: 'Hồ sơ KYC được gửi bởi người dùng và đưa vào hàng đợi AI xử lý',
            metadata: {
              jobId,
              idDocumentType: dto.idDocumentType || 'CCCD',
            },
            createdAt: now,
          },
        });

        // 5. Create Transactional Outbox Event for reliable asynchronous publishing
        const jobPayload = {
          jobId,
          kycCaseId: caseId,
          workerProfileId: worker.id,
          userId,
          documentFrontRef: dto.documentFrontRef,
          documentBackRef: dto.documentBackRef || null,
          selfieRef: dto.selfieRef,
          idDocumentType: dto.idDocumentType || 'CCCD',
        };

        await tx.outboxEvent.create({
          data: {
            id: outboxId,
            eventType: EVENT_PATTERNS.KYC_JOB_PROCESS,
            eventVersion: 1,
            payload: jobPayload,
            status: 'pending',
            retryCount: 0,
            nextRetryAt: now,
            createdAt: now,
          },
        });

        return {
          kycCase,
          job,
          worker,
          jobPayload,
        };
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }

  async markJobProcessing(jobId: string, kycCaseId: string) {
    const now = new Date();
    const job = await this.db.aiAnalysisJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`AI analysis job ${jobId} not found`);
    }

    const kycCase = await this.db.kycCase.findUnique({ where: { id: kycCaseId } });
    if (!kycCase) {
      throw new NotFoundException(`KYC case ${kycCaseId} not found`);
    }

    // Check if job is still the active job for this case
    if (kycCase.activeJobId && kycCase.activeJobId !== jobId) {
      return { isStale: true, job, kycCase };
    }

    // Check if job or case is already completed / under review
    if (
      job.status === 'succeeded' ||
      kycCase.status === 'reviewing' ||
      kycCase.status === 'approved'
    ) {
      return { isStale: true, job, kycCase };
    }

    const updatedJob = await this.db.aiAnalysisJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: now,
        updatedAt: now,
      },
    });

    return { isStale: false, job: updatedJob, kycCase };
  }

  async recordJobSuccessAndMoveToReview(
    jobId: string,
    kycCaseId: string,
    aiResult: any,
  ) {
    const now = new Date();
    const historyId = crypto.randomUUID();

    return this.db.$transaction(
      async (tx) => {
        const kycCase = await tx.kycCase.findUnique({ where: { id: kycCaseId } });
        if (!kycCase) {
          throw new NotFoundException(`KYC case ${kycCaseId} not found`);
        }

        // Prevent stale jobs from overwriting newer cases
        if (kycCase.activeJobId && kycCase.activeJobId !== jobId) {
          return { isStale: true };
        }

        // Update AI Job
        const updatedJob = await tx.aiAnalysisJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            aiResult,
            completedAt: now,
            updatedAt: now,
          },
        });

        const ocr = aiResult?.ocr || {};
        const faceVerification = aiResult?.faceVerification || {};
        const rawIdNumber = ocr.id || ocr.card_id || ocr.id_number;
        const maskedId = rawIdNumber ? maskIdNumber(rawIdNumber) : kycCase.idNumberMasked;
        const similarity =
          faceVerification.similarity !== undefined
            ? Number(faceVerification.similarity)
            : null;

        // Update KYC case to 'reviewing' (awaiting admin review)
        const updatedCase = await tx.kycCase.update({
          where: { id: kycCaseId },
          data: {
            status: 'reviewing',
            idNumberMasked: maskedId,
            aiSimilarityScore: similarity,
            rawOcrData: ocr,
            aiResult,
            reviewNote: 'Đã hoàn tất phân tích AI. Đang chờ Quản trị viên xem xét và duyệt.',
            version: { increment: 1 },
            updatedAt: now,
          },
        });

        // Update WorkerProfile status to 'under_review'
        await tx.workerProfile.update({
          where: { id: kycCase.workerProfileId },
          data: {
            status: 'under_review',
            updatedAt: now,
          },
        });

        // Record review history
        await tx.kycReviewHistory.create({
          data: {
            id: historyId,
            kycCaseId,
            action: 'ai_analysis_completed',
            fromStatus: 'submitted',
            toStatus: 'reviewing',
            note: `Hoàn tất phân tích OCR và đối sánh khuôn mặt (Độ tương đồng: ${similarity ?? 'N/A'})`,
            metadata: {
              jobId,
              isMatch: faceVerification.isMatch,
              similarity,
            },
            createdAt: now,
          },
        });

        return { isStale: false, job: updatedJob, kycCase: updatedCase };
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }

  async recordJobFailure(
    jobId: string,
    kycCaseId: string,
    failureReason: string,
    retryCount: number,
    isFinalFailure: boolean,
  ) {
    const now = new Date();
    const updatedJob = await this.db.aiAnalysisJob.update({
      where: { id: jobId },
      data: {
        status: isFinalFailure ? 'failed' : 'pending',
        retryCount,
        failureReason,
        updatedAt: now,
      },
    });

    if (isFinalFailure) {
      const kycCase = await this.db.kycCase.findUnique({ where: { id: kycCaseId } });
      if (kycCase && kycCase.activeJobId === jobId) {
        await this.db.kycCase.update({
          where: { id: kycCaseId },
          data: {
            status: 'reviewing',
            reviewNote: `Phân tích AI thất bại sau ${retryCount} lần thử: ${failureReason}. Chờ Admin xem xét thủ công.`,
            version: { increment: 1 },
            updatedAt: now,
          },
        });

        await this.db.kycReviewHistory.create({
          data: {
            id: crypto.randomUUID(),
            kycCaseId,
            action: 'ai_analysis_failed',
            fromStatus: 'submitted',
            toStatus: 'reviewing',
            note: `Xử lý AI thất bại: ${failureReason}`,
            metadata: { jobId, retryCount },
            createdAt: now,
          },
        });
      }
    }

    return updatedJob;
  }

  async reviewKycCaseByAdmin(
    adminUserId: string,
    caseId: string,
    decision: 'approved' | 'rejected',
    note?: string,
  ) {
    const now = new Date();
    const isApproved = decision === 'approved';
    const historyId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();

    return this.db.$transaction(
      async (tx) => {
      const kycCase = await tx.kycCase.findUnique({
        where: { id: caseId },
        include: { workerProfile: true },
      });

      if (!kycCase) {
        throw new NotFoundException('Không tìm thấy hồ sơ KYC.');
      }

      // Prevent reviewing finalized case or draft
      if (kycCase.status === 'approved' || kycCase.status === 'rejected') {
        throw new Error(
          `Hồ sơ KYC đã được xử lý trước đó với trạng thái ${kycCase.status}. Không thể duyệt lại.`,
        );
      }

      const fromStatus = kycCase.status;
      const toStatus = isApproved ? 'approved' : 'rejected';

      // 1. Update KYC case with version increment
      const updatedCase = await tx.kycCase.update({
        where: { id: caseId },
        data: {
          status: toStatus,
          reviewedByUserId: adminUserId,
          reviewedAt: now,
          reviewNote: note || null,
          version: { increment: 1 },
          updatedAt: now,
        },
      });

      // 2. Synchronize WorkerProfile status
      await tx.workerProfile.update({
        where: { id: kycCase.workerProfileId },
        data: {
          status: isApproved ? 'verified' : 'rejected',
          verifiedAt: isApproved ? now : undefined,
          approvedAt: isApproved ? now : undefined,
          updatedAt: now,
        },
      });

      // 3. Record audit history
      await tx.kycReviewHistory.create({
        data: {
          id: historyId,
          kycCaseId: caseId,
          action: `admin_${decision}`,
          fromStatus,
          toStatus,
          performedByUserId: adminUserId,
          note: note || (isApproved ? 'Admin đã phê duyệt KYC' : 'Admin đã từ chối KYC'),
          metadata: {
            decision,
            reviewedAt: now.toISOString(),
          },
          createdAt: now,
        },
      });

      // 4. Create OutboxEvent to broadcast status update
      const eventType = isApproved
        ? EVENT_PATTERNS.KYC_COMPLETED
        : EVENT_PATTERNS.KYC_FAILED;

      await tx.outboxEvent.create({
        data: {
          id: outboxId,
          eventType,
          eventVersion: 1,
          payload: {
            kycCaseId: caseId,
            workerProfileId: kycCase.workerProfileId,
            userId: kycCase.workerProfile.userId,
            decision,
            reviewedBy: adminUserId,
            reviewedAt: now.toISOString(),
            note,
          },
          status: 'pending',
          retryCount: 0,
          nextRetryAt: now,
          createdAt: now,
        },
      });

      return updatedCase;
    },
    { maxWait: 15000, timeout: 30000 },
  );
  }

  async listKycCases(status?: string, page = 1, limit = 20) {
    const take = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [cases, total] = await Promise.all([
      this.db.kycCase.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          workerProfile: {
            include: { user: true },
          },
          reviewer: true,
          jobs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.db.kycCase.count({ where }),
    ]);

    return {
      cases,
      total,
      page: Number(page) || 1,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }
}
