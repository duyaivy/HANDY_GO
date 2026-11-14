import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { UserTrustPrismaService } from '@app/database';
import { UserTrustServiceService } from '../src/user-trust-service.service.js';
import { CatalogClient } from '../src/catalog/catalog.client.js';

describe('Worker Service Registration Concurrent & Postgres Precision Integration', () => {
  let prisma: UserTrustPrismaService;
  let service: UserTrustServiceService;
  let catalogClientMock: Partial<CatalogClient>;
  let isPostgresAvailable = false;

  const testUserIds: string[] = [];
  const testWorkerProfileIds: string[] = [];
  const testRegistrationIds: string[] = [];

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

    catalogClientMock = {
      getServices: async () => [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Sửa chữa điện lạnh',
          categoryId: '22222222-2222-2222-2222-222222222222',
          categoryName: 'Điện lạnh',
          categoryIsActive: true,
          isActive: true,
        },
      ],
    };

    service = new UserTrustServiceService(
      prisma,
      catalogClientMock as CatalogClient,
    );

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      // Verify workerServiceRegistration table is reachable and version column exists
      await prisma.workerServiceRegistration.findFirst();
      isPostgresAvailable = true;
    } catch (err) {
      isPostgresAvailable = false;
      console.warn(
        'PostgreSQL is not reachable or tables do not exist:',
        (err as Error).message,
      );
    }
  });

  afterAll(async () => {
    if (!isPostgresAvailable) {
      await prisma?.$disconnect();
      return;
    }

    try {
      if (testRegistrationIds.length > 0) {
        await prisma.workerServiceRegistration.deleteMany({
          where: { id: { in: testRegistrationIds } },
        });
      }
      if (testWorkerProfileIds.length > 0) {
        await prisma.workerServiceArea.deleteMany({
          where: { workerProfileId: { in: testWorkerProfileIds } },
        });
        await prisma.workerServiceOffering.deleteMany({
          where: { workerProfileId: { in: testWorkerProfileIds } },
        });
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
      console.warn('Cleanup error in registration concurrent test:', (err as Error).message);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('eliminates false 409 conflict caused by microsecond precision in timestamptz(6)', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }

    const userId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const workerProfileId = crypto.randomUUID();
    const regId = crypto.randomUUID();

    testUserIds.push(userId, adminId);
    testWorkerProfileIds.push(workerProfileId);
    testRegistrationIds.push(regId);

    // Insert user & workerProfile
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.users (id, full_name, status, created_at, updated_at)
      VALUES (${userId}::uuid, 'Worker Precision Test', 'active', NOW(), NOW()),
             (${adminId}::uuid, 'Admin Precision Test', 'active', NOW(), NOW())
    `;
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_profiles (id, user_id, status, created_at, updated_at)
      VALUES (${workerProfileId}::uuid, ${userId}::uuid, 'draft', NOW(), NOW())
    `;

    // Insert registration with direct SQL to get a timestamp with 6 decimal places (e.g. .123456)
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_service_registrations (
        id, worker_profile_id, category_ids, services, service_area, evidence_files, idempotency_key, status, version, created_at, updated_at
      ) VALUES (
        ${regId}::uuid,
        ${workerProfileId}::uuid,
        '["22222222-2222-2222-2222-222222222222"]'::jsonb,
        '[{"serviceId":"11111111-1111-1111-1111-111111111111","serviceName":"Sửa điện","experienceYears":3}]'::jsonb,
        '{"address":"Đà Nẵng","latitude":16.05,"longitude":108.2,"radiusKm":10}'::jsonb,
        '[{"url":"https://example.com/cert.jpg","fileType":"image"}]'::jsonb,
        ${crypto.randomUUID()},
        'pending',
        1,
        '2026-11-14 09:30:15.123456+00'::timestamptz,
        '2026-11-14 09:30:15.123456+00'::timestamptz
      )
    `;

    // Admin reviews and approves the registration
    const result = await service.reviewServiceRegistration(adminId, regId, {
      decision: 'approved',
      expectedVersion: 1,
    });

    expect(result.statusCode).toBe(200);
    expect(result.data.status).toBe('approved');

    const updated = await prisma.workerServiceRegistration.findUnique({
      where: { id: regId },
    });
    expect(updated?.status).toBe('approved');
    expect(updated?.version).toBe(2);
  });

  it('prevents Admin from approving stale payload when worker concurrently updates registration (worker update ↔ admin review race)', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }

    const userId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const workerProfileId = crypto.randomUUID();
    const regId = crypto.randomUUID();

    testUserIds.push(userId, adminId);
    testWorkerProfileIds.push(workerProfileId);
    testRegistrationIds.push(regId);

    await prisma.$queryRaw`
      INSERT INTO user_trust_service.users (id, full_name, status, created_at, updated_at)
      VALUES (${userId}::uuid, 'Worker Race Test', 'active', NOW(), NOW()),
             (${adminId}::uuid, 'Admin Race Test', 'active', NOW(), NOW())
    `;
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_profiles (id, user_id, status, created_at, updated_at)
      VALUES (${workerProfileId}::uuid, ${userId}::uuid, 'draft', NOW(), NOW())
    `;
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_service_registrations (
        id, worker_profile_id, category_ids, services, service_area, evidence_files, idempotency_key, status, version, created_at, updated_at
      ) VALUES (
        ${regId}::uuid,
        ${workerProfileId}::uuid,
        '["22222222-2222-2222-2222-222222222222"]'::jsonb,
        '[{"serviceId":"11111111-1111-1111-1111-111111111111","serviceName":"Old Service","experienceYears":1}]'::jsonb,
        '{"address":"Đà Nẵng","latitude":16.05,"longitude":108.2,"radiusKm":10}'::jsonb,
        '[{"url":"https://example.com/initial-evidence.jpg","fileType":"image"}]'::jsonb,
        ${crypto.randomUUID()},
        'pending',
        1,
        NOW(),
        NOW()
      )
    `;

    // 1. Admin opens detail page and reads registration at version 1
    const adminDetail = await service.getAdminServiceRegistrationDetail(regId);
    expect(adminDetail.data.version).toBe(1);
    const adminObservedVersion = adminDetail.data.version;

    // 2. Worker modifies registration with valid evidence before admin clicks approve (increments version to 2)
    const workerUpdateRes = await service.updateWorkerServiceRegistration(userId, regId, {
      categoryIds: ['22222222-2222-2222-2222-222222222222'],
      services: [
        {
          serviceId: '11111111-1111-1111-1111-111111111111',
          title: 'New Service Modified by Worker',
          experienceYears: 5,
        },
      ],
      serviceArea: {
        address: 'Hà Nội',
        latitude: 21.0285,
        longitude: 105.8542,
        radiusKm: 20,
      },
      evidenceFiles: [
        {
          url: 'https://example.com/evidence-updated.jpg',
          fileType: 'image',
        },
      ],
    } as any);
    expect(workerUpdateRes.statusCode).toBe(200);

    // Database now has version = 2
    const currentInDb = await prisma.workerServiceRegistration.findUnique({
      where: { id: regId },
    });
    expect(currentInDb?.version).toBe(2);

    // 3. Admin attempts to approve using the stale version (version 1) that was loaded on screen
    // Must throw ConflictException and reject the stale approval
    await expect(
      service.reviewServiceRegistration(adminId, regId, {
        decision: 'approved',
        expectedVersion: adminObservedVersion,
      }),
    ).rejects.toThrow(ConflictException);

    // Admin attempts to reject using the stale version -> also throws ConflictException
    await expect(
      service.reviewServiceRegistration(adminId, regId, {
        decision: 'rejected',
        reason: 'Stale rejection attempt',
        expectedVersion: adminObservedVersion,
      }),
    ).rejects.toThrow(ConflictException);

    // 4. Admin refreshes the page (reads fresh detail with version = 2) and successfully approves
    const freshDetail = await service.getAdminServiceRegistrationDetail(regId);
    expect(freshDetail.data.version).toBe(2);

    const freshApproveRes = await service.reviewServiceRegistration(adminId, regId, {
      decision: 'approved',
      expectedVersion: freshDetail.data.version,
    });
    expect(freshApproveRes.statusCode).toBe(200);
    expect(freshApproveRes.data.status).toBe('approved');

    const finalDbCase = await prisma.workerServiceRegistration.findUnique({
      where: { id: regId },
    });
    expect(finalDbCase?.status).toBe('approved');
    expect(finalDbCase?.version).toBe(3);
  });

  it('handles 2 concurrent worker updates atomically (only 1 succeeds, other gets 409 ConflictException)', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }

    const userId = crypto.randomUUID();
    const workerProfileId = crypto.randomUUID();
    const regId = crypto.randomUUID();

    testUserIds.push(userId);
    testWorkerProfileIds.push(workerProfileId);
    testRegistrationIds.push(regId);

    await prisma.$queryRaw`
      INSERT INTO user_trust_service.users (id, full_name, status, created_at, updated_at)
      VALUES (${userId}::uuid, 'Worker Concurrent PUT', 'active', NOW(), NOW())
    `;
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_profiles (id, user_id, status, created_at, updated_at)
      VALUES (${workerProfileId}::uuid, ${userId}::uuid, 'draft', NOW(), NOW())
    `;
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_service_registrations (
        id, worker_profile_id, category_ids, services, service_area, evidence_files, idempotency_key, status, version, created_at, updated_at
      ) VALUES (
        ${regId}::uuid,
        ${workerProfileId}::uuid,
        '["22222222-2222-2222-2222-222222222222"]'::jsonb,
        '[{"serviceId":"11111111-1111-1111-1111-111111111111","serviceName":"Initial","experienceYears":1}]'::jsonb,
        '{"address":"Đà Nẵng","latitude":16.05,"longitude":108.2,"radiusKm":10}'::jsonb,
        '[{"url":"https://example.com/initial.jpg","fileType":"image"}]'::jsonb,
        ${crypto.randomUUID()},
        'pending',
        1,
        NOW(),
        NOW()
      )
    `;

    const dtoSession1 = {
      categoryIds: ['22222222-2222-2222-2222-222222222222'],
      services: [{ serviceId: '11111111-1111-1111-1111-111111111111', title: 'Session 1', experienceYears: 2 }],
      serviceArea: { address: 'Đà Nẵng', latitude: 16.05, longitude: 108.2, radiusKm: 10 },
      evidenceFiles: [{ url: 'https://example.com/evidence1.jpg', fileType: 'image' }],
    };

    const dtoSession2 = {
      categoryIds: ['22222222-2222-2222-2222-222222222222'],
      services: [{ serviceId: '11111111-1111-1111-1111-111111111111', title: 'Session 2', experienceYears: 3 }],
      serviceArea: { address: 'Đà Nẵng', latitude: 16.05, longitude: 108.2, radiusKm: 15 },
      evidenceFiles: [{ url: 'https://example.com/evidence2.jpg', fileType: 'image' }],
    };

    // Barrier ensuring both concurrent requests have read version 1 before either executes updateMany
    let entered = 0;
    let barrierResolve: () => void;
    const barrier = new Promise<void>((resolve) => {
      barrierResolve = resolve;
    });

    const originalGetServices = catalogClientMock.getServices;
    catalogClientMock.getServices = async () => {
      entered++;
      if (entered === 2) {
        barrierResolve();
      } else {
        await barrier;
      }
      return originalGetServices ? originalGetServices() : [];
    };

    try {
      // Both sessions read registration with version = 1 and contend on updateMany
      const [put1, put2] = await Promise.allSettled([
        service.updateWorkerServiceRegistration(userId, regId, dtoSession1 as any),
        service.updateWorkerServiceRegistration(userId, regId, dtoSession2 as any),
      ]);

      // Exactly ONE succeeds (200 OK), exactly ONE fails with 409 ConflictException
      const fulfilled = [put1, put2].filter((r) => r.status === 'fulfilled');
      const rejected = [put1, put2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const loser = (rejected[0] as PromiseRejectedResult).reason;
      expect(loser instanceof ConflictException).toBe(true);
      expect(loser.message).toContain('cập nhật');

      const finalReg = await prisma.workerServiceRegistration.findUnique({
        where: { id: regId },
      });
      // Version must be exactly 2
      expect(finalReg!.version).toBe(2);
    } finally {
      catalogClientMock.getServices = originalGetServices;
    }
  });

  it('handles 2 concurrent Admin reviews atomically (only 1 wins, other gets ConflictException)', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }

    const userId = crypto.randomUUID();
    const admin1Id = crypto.randomUUID();
    const admin2Id = crypto.randomUUID();
    const workerProfileId = crypto.randomUUID();
    const regId = crypto.randomUUID();

    testUserIds.push(userId, admin1Id, admin2Id);
    testWorkerProfileIds.push(workerProfileId);
    testRegistrationIds.push(regId);

    await prisma.$queryRaw`
      INSERT INTO user_trust_service.users (id, full_name, status, created_at, updated_at)
      VALUES (${userId}::uuid, 'Worker Dual Admin', 'active', NOW(), NOW()),
             (${admin1Id}::uuid, 'Admin Alpha', 'active', NOW(), NOW()),
             (${admin2Id}::uuid, 'Admin Beta', 'active', NOW(), NOW())
    `;
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_profiles (id, user_id, status, created_at, updated_at)
      VALUES (${workerProfileId}::uuid, ${userId}::uuid, 'draft', NOW(), NOW())
    `;
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_service_registrations (
        id, worker_profile_id, category_ids, services, service_area, evidence_files, idempotency_key, status, version, created_at, updated_at
      ) VALUES (
        ${regId}::uuid,
        ${workerProfileId}::uuid,
        '["22222222-2222-2222-2222-222222222222"]'::jsonb,
        '[{"serviceId":"11111111-1111-1111-1111-111111111111","serviceName":"Plumbing","experienceYears":4}]'::jsonb,
        '{"address":"Đà Nẵng","latitude":16.05,"longitude":108.2,"radiusKm":10}'::jsonb,
        '[{"url":"https://example.com/evidence-admin.jpg","fileType":"image"}]'::jsonb,
        ${crypto.randomUUID()},
        'pending',
        1,
        NOW(),
        NOW()
      )
    `;

    // 2 Admins review concurrently: both send expectedVersion: 1 (one approves, one rejects)
    const [rev1, rev2] = await Promise.allSettled([
      service.reviewServiceRegistration(admin1Id, regId, { decision: 'approved', expectedVersion: 1 }),
      service.reviewServiceRegistration(admin2Id, regId, { decision: 'rejected', reason: 'Denied by Beta', expectedVersion: 1 }),
    ]);

    const fulfilled = [rev1, rev2].filter((r) => r.status === 'fulfilled');
    const rejected = [rev1, rev2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const loser = (rejected[0] as PromiseRejectedResult).reason;
    expect(loser instanceof ConflictException).toBe(true);

    const finalReg = await prisma.workerServiceRegistration.findUnique({
      where: { id: regId },
    });
    expect(finalReg!.version).toBe(2);
    expect(['approved', 'rejected']).toContain(finalReg!.status);
  });
});
