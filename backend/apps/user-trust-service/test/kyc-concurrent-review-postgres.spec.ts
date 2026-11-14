import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { UserTrustPrismaService } from '@app/database';
import { KycRepository } from '../src/kyc/kyc.repository.js';

describe('KYC Admin Concurrent Review Integration with PostgreSQL', () => {
  let prisma: UserTrustPrismaService;
  let kycRepository: KycRepository;
  let isPostgresAvailable = false;

  const testUserIds: string[] = [];
  const testWorkerProfileIds: string[] = [];
  const testKycCaseIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL_USER_TRUST =
      process.env.DATABASE_URL_USER_TRUST ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/handy_user_trust';

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
    expect(
      losingReason instanceof ConflictException ||
        losingReason.message.includes('quản trị viên khác') ||
        losingReason.message.includes('thay đổi đồng thời'),
    ).toBe(true);

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
});

