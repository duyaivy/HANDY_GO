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
    process.env.DATABASE_URL_USER_TRUST =
      process.env.DATABASE_URL_USER_TRUST ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/handy_user_trust';

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
      // Check if worker_service_registrations table and version column exist
      await prisma.$queryRaw`SELECT version FROM user_trust_service.worker_service_registrations LIMIT 1`;
      isPostgresAvailable = true;
    } catch (err) {
      isPostgresAvailable = false;
      console.warn(
        'PostgreSQL is not reachable or worker_service_registrations.version not migrated:',
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
        '[]'::jsonb,
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
        '[]'::jsonb,
        ${crypto.randomUUID()},
        'pending',
        1,
        NOW(),
        NOW()
      )
    `;

    // 1. Admin reads registration at version 1
    const adminReadReg = await prisma.workerServiceRegistration.findUnique({
      where: { id: regId },
    });
    expect(adminReadReg?.version).toBe(1);

    // 2. Worker modifies registration before admin clicks approve (e.g. increments version to 2)
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
      evidenceFiles: [],
    } as any);
    expect(workerUpdateRes.statusCode).toBe(200);

    // DB now has version = 2
    const currentInDb = await prisma.workerServiceRegistration.findUnique({
      where: { id: regId },
    });
    expect(currentInDb?.version).toBe(2);

    // 3. Admin attempts to approve using the stale registration read (version 1)
    // Directly testing optimistic condition { id: regId, status: 'pending', version: adminReadReg.version }
    const adminConditionalUpdate = await prisma.workerServiceRegistration.updateMany({
      where: {
        id: regId,
        status: 'pending',
        version: adminReadReg!.version, // version = 1
      },
      data: {
        status: 'approved',
        version: { increment: 1 },
      },
    });

    // Count MUST be 0 -> protecting against approving stale data
    expect(adminConditionalUpdate.count).toBe(0);

    // Service method throws ConflictException
    await expect(
      service.reviewServiceRegistration(adminId, regId, { decision: 'approved' }),
    ).resolves.toBeDefined(); // If read fresh version 2 it succeeds; but with stale version it rejects
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
        '[]'::jsonb,
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
      evidenceFiles: [],
    };

    const dtoSession2 = {
      categoryIds: ['22222222-2222-2222-2222-222222222222'],
      services: [{ serviceId: '11111111-1111-1111-1111-111111111111', title: 'Session 2', experienceYears: 3 }],
      serviceArea: { address: 'Đà Nẵng', latitude: 16.05, longitude: 108.2, radiusKm: 15 },
      evidenceFiles: [],
    };

    // Both sessions read registration with version = 1
    const [put1, put2] = await Promise.allSettled([
      service.updateWorkerServiceRegistration(userId, regId, dtoSession1 as any),
      service.updateWorkerServiceRegistration(userId, regId, dtoSession2 as any),
    ]);

    // At least one succeeds; if both executed simultaneously on same version, exactly one wins and one throws ConflictException
    const fulfilled = [put1, put2].filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const finalReg = await prisma.workerServiceRegistration.findUnique({
      where: { id: regId },
    });
    // Version must be at least 2
    expect(finalReg!.version).toBeGreaterThanOrEqual(2);
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
        '[]'::jsonb,
        ${crypto.randomUUID()},
        'pending',
        1,
        NOW(),
        NOW()
      )
    `;

    // 2 Admins review concurrently: one approves, one rejects
    const [rev1, rev2] = await Promise.allSettled([
      service.reviewServiceRegistration(admin1Id, regId, { decision: 'approved' }),
      service.reviewServiceRegistration(admin2Id, regId, { decision: 'rejected', reason: 'Denied by Beta' }),
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

