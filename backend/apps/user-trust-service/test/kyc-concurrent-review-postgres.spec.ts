import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { UserTrustPrismaService } from '@app/database';
import { KycRepository } from '../src/kyc/kyc.repository.js';
import { UserTrustServiceService } from '../src/user-trust-service.service.js';

describe('KYC Admin Concurrent Review Integration with PostgreSQL', () => {
  let prisma: UserTrustPrismaService;
  let kycRepository: KycRepository;
  let isPostgresAvailable = false;

  const testUserIds: string[] = [];
  const testWorkerProfileIds: string[] = [];
  const testKycCaseIds: string[] = [];
  const testEventInboxIds: string[] = [];

  beforeAll(async () => {
    const fallbackTestUrl =
      process.env.DATABASE_URL_USER_TRUST ||
      process.env.INCIDENT_DATABASE_TEST_URL ||
      process.env.WALLET_MIGRATION_TEST_URL ||
      process.env.DATABASE_URL;

    if (fallbackTestUrl) {
      try {
        const u = new URL(fallbackTestUrl);
        if (!u.searchParams.get('schema')) {
          u.searchParams.set('schema', 'user_trust_service');
        }
        process.env.DATABASE_URL_USER_TRUST = u.toString();
      } catch {
        process.env.DATABASE_URL_USER_TRUST = fallbackTestUrl;
      }
    } else {
      process.env.DATABASE_URL_USER_TRUST =
        'postgresql://postgres:postgres@localhost:5432/handy_user_trust';
    }

    prisma = new UserTrustPrismaService();
    kycRepository = new KycRepository(prisma);

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.kycCase.findFirst();
      isPostgresAvailable = true;
    } catch (err) {
      isPostgresAvailable = false;
      console.warn('PostgreSQL is not reachable or tables do not exist:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (!isPostgresAvailable) {
      await prisma?.$disconnect();
      return;
    }

    try {
      if (testEventInboxIds.length > 0) {
        await prisma.eventInbox.deleteMany({
          where: { id: { in: testEventInboxIds } },
        }).catch(() => {});
      }

      if (testKycCaseIds.length > 0) {
        await prisma.kycReviewHistory.deleteMany({
          where: { kycCaseId: { in: testKycCaseIds } },
        });
        await prisma.aiAnalysisJob.deleteMany({
          where: { kycCaseId: { in: testKycCaseIds } },
        });
        await prisma.outboxEvent.deleteMany({
          where: {
            payload: {
              path: ['kycCaseId'],
              string_contains: testKycCaseIds[0],
            },
          },
        }).catch(() => {});
        await prisma.kycCase.deleteMany({
          where: { id: { in: testKycCaseIds } },
        });
      }

      if (testWorkerProfileIds.length > 0) {
        await prisma.workerProfile.deleteMany({
          where: { id: { in: testWorkerProfileIds } },
        });
      }

      if (testUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: testUserIds } },
        });
      }
    } catch (err) {
      console.warn('Cleanup error in kyc concurrent test:', (err as Error).message);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('atomically handles 2 concurrent admin reviews with optimistic locking (only 1 wins, other gets ConflictException)', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }

    const now = new Date();
    const userId = crypto.randomUUID();
    const admin1Id = crypto.randomUUID();
    const admin2Id = crypto.randomUUID();
    const workerProfileId = crypto.randomUUID();
    const kycCaseId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    testUserIds.push(userId, admin1Id, admin2Id);
    testWorkerProfileIds.push(workerProfileId);
    testKycCaseIds.push(kycCaseId);

    // 1. Seed user & admins
    await prisma.user.createMany({
      data: [
        { id: userId, fullName: 'Worker Concurrency Test', status: 'active', createdAt: now, updatedAt: now },
        { id: admin1Id, fullName: 'Admin One', status: 'active', createdAt: now, updatedAt: now },
        { id: admin2Id, fullName: 'Admin Two', status: 'active', createdAt: now, updatedAt: now },
      ],
    });

    // 2. Seed worker profile in under_review
    await prisma.workerProfile.create({
      data: {
        id: workerProfileId,
        userId,
        status: 'under_review',
        createdAt: now,
        updatedAt: now,
      },
    });

    // 3. Seed KYC Case in reviewing status with version = 1
    await prisma.kycCase.create({
      data: {
        id: kycCaseId,
        workerProfileId,
        idDocumentType: 'CCCD',
        idNumberMasked: '079201******',
        documentFrontRef: 'https://example.com/front.jpg',
        selfieRef: 'https://example.com/selfie.jpg',
        status: 'reviewing',
        version: 1,
        activeJobId: jobId,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 4. Seed associated AI analysis job
    await prisma.aiAnalysisJob.create({
      data: {
        id: jobId,
        kycCaseId,
        workerProfileId,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      },
    });

    // 5. Fire two concurrent admin reviews simultaneously (one approve, one reject)
    const [review1, review2] = await Promise.allSettled([
      kycRepository.reviewKycCaseByAdmin(admin1Id, kycCaseId, 'approved', 'Admin 1 approves'),
      kycRepository.reviewKycCaseByAdmin(admin2Id, kycCaseId, 'rejected', 'Admin 2 rejects'),
    ]);

    // 6. Assertions on concurrent outcome:
    // Exactly ONE promise must be fulfilled, exactly ONE must be rejected
    const fulfilled = [review1, review2].filter((r) => r.status === 'fulfilled');
    const rejected = [review1, review2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The losing request MUST throw ConflictException (or message about concurrent modification)
    const losingReason = (rejected[0] as PromiseRejectedResult).reason;
    const isConflict =
      losingReason instanceof ConflictException ||
      (losingReason && typeof losingReason === 'object' && 'status' in losingReason && (losingReason as any).status === 409) ||
      (losingReason?.message && (
        losingReason.message.includes('quản trị viên khác') ||
        losingReason.message.includes('thay đổi đồng thời') ||
        losingReason.message.includes('được xử lý trước đó')
      ));
    expect(Boolean(isConflict)).toBe(true);

    // 7. Verify database integrity on PostgreSQL:
    const finalCase = await prisma.kycCase.findUnique({
      where: { id: kycCaseId },
    });
    expect(finalCase).not.toBeNull();
    // Version must be exactly 2 (incremented once by the winning transaction)
    expect(finalCase!.version).toBe(2);
    // Final status must be either approved or rejected, never corrupted
    expect(['approved', 'rejected']).toContain(finalCase!.status);

    const winningDecision = finalCase!.status;
    const finalWorker = await prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
    });
    // Worker profile status must match the winning decision
    expect(finalWorker!.status).toBe(winningDecision === 'approved' ? 'verified' : 'rejected');

    // Exactly 1 review history entry created for this admin review
    const histories = await prisma.kycReviewHistory.findMany({
      where: {
        kycCaseId,
        action: { in: ['admin_approved', 'admin_rejected'] },
      },
    });
    expect(histories).toHaveLength(1);
    expect(histories[0].toStatus).toBe(winningDecision);
  });

  it('atomically resolves race condition between AI consumer and Admin review on PostgreSQL (Admin decision is never overwritten)', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }

    const now = new Date();
    const userId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const workerProfileId = crypto.randomUUID();
    const kycCaseId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    testUserIds.push(userId, adminId);
    testWorkerProfileIds.push(workerProfileId);
    testKycCaseIds.push(kycCaseId);
    testEventInboxIds.push(eventId);

    // 1. Seed user & admin
    await prisma.user.createMany({
      data: [
        { id: userId, fullName: 'Worker Consumer Race Test', status: 'active', createdAt: now, updatedAt: now },
        { id: adminId, fullName: 'Admin Reviewer', status: 'active', createdAt: now, updatedAt: now },
      ],
    });

    // 2. Seed worker profile in under_review
    await prisma.workerProfile.create({
      data: {
        id: workerProfileId,
        userId,
        status: 'under_review',
        createdAt: now,
        updatedAt: now,
      },
    });

    // 3. Seed KYC Case in reviewing status with version = 1
    await prisma.kycCase.create({
      data: {
        id: kycCaseId,
        workerProfileId,
        idDocumentType: 'CCCD',
        idNumberMasked: '079201******',
        documentFrontRef: 'https://example.com/front.jpg',
        selfieRef: 'https://example.com/selfie.jpg',
        status: 'reviewing',
        version: 1,
        activeJobId: jobId,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 4. Seed associated AI analysis job
    await prisma.aiAnalysisJob.create({
      data: {
        id: jobId,
        kycCaseId,
        workerProfileId,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      },
    });

    const userTrustService = new UserTrustServiceService(prisma);

    // 5. Fire Admin rejection and AI handleKycCompleted concurrently
    const [adminResult, consumerResult] = await Promise.allSettled([
      kycRepository.reviewKycCaseByAdmin(adminId, kycCaseId, 'rejected', 'Admin rejects fraud document'),
      userTrustService.handleKycCompleted({
        eventId,
        eventType: 'kyc.completed',
        producer: 'ai-service',
        timestamp: new Date().toISOString(),
        data: {
          userId,
          kycCaseId,
          similarityScore: 98,
        },
      } as any),
    ]);

    // 6. Assertions on concurrent outcome:
    // Both promises settle cleanly without database deadlocks
    expect(adminResult.status).toBe('fulfilled');
    expect(consumerResult.status).toBe('fulfilled');

    // 7. Verify database state on PostgreSQL:
    const finalCase = await prisma.kycCase.findUnique({
      where: { id: kycCaseId },
    });
    expect(finalCase).not.toBeNull();
    // Case version must be at least 2
    expect(finalCase!.version).toBeGreaterThanOrEqual(2);

    const finalWorker = await prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
    });
    expect(finalWorker).not.toBeNull();

    // The state of WorkerProfile MUST match the case status.
    // If Admin rejection finalized the case, worker profile MUST NOT be overwritten to 'verified'.
    if (finalCase!.status === 'rejected') {
      expect(finalWorker!.status).toBe('rejected');
    } else {
      expect(finalCase!.status).toBe('approved');
      expect(finalWorker!.status).toBe('verified');
    }
  });
});

