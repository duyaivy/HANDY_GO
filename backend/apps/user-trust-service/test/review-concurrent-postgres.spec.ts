import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { UserTrustPrismaService } from '@app/database';
import { UserTrustServiceService } from '../src/user-trust-service.service.js';
import type { OrderClient } from '../src/clients/order.client.js';

describe('Review Concurrent Rating Aggregate PostgreSQL Integration', () => {
  let prisma: UserTrustPrismaService;
  let service: UserTrustServiceService;
  let orderClientMock: Partial<OrderClient>;
  let isPostgresAvailable = false;

  const testUserIds: string[] = [];
  const testWorkerProfileIds: string[] = [];
  const testReviewIds: string[] = [];
  const testOrderIds: string[] = [];

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

    orderClientMock = {
      getOrder: async (orderId: string) => {
        const match = ordersMap.get(orderId);
        if (!match) {
          throw new Error(`Order ${orderId} not found in test mock`);
        }
        return match;
      },
    };

    service = new UserTrustServiceService(
      prisma,
      undefined,
      undefined,
      undefined,
      orderClientMock as OrderClient,
    );

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.workerReview.findFirst();
      await prisma.workerProfile.findFirst();
      isPostgresAvailable = true;
    } catch (err) {
      isPostgresAvailable = false;
      console.warn(
        'PostgreSQL is not reachable or tables do not exist:',
        (err as Error).message,
      );
    }
  });

  const ordersMap = new Map<string, any>();

  afterAll(async () => {
    if (!isPostgresAvailable) {
      await prisma?.$disconnect();
      return;
    }

    try {
      if (testReviewIds.length > 0) {
        await prisma.reviewMedia.deleteMany({
          where: { reviewId: { in: testReviewIds } },
        });
        await prisma.workerReview.deleteMany({
          where: { id: { in: testReviewIds } },
        });
      }

      if (testOrderIds.length > 0) {
        await prisma.outboxEvent.deleteMany({
          where: {
            payload: {
              path: ['orderId'],
              string_contains: testOrderIds[0],
            },
          },
        }).catch(() => {});
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
      console.warn('Cleanup error in review concurrent test:', (err as Error).message);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('Khóa dòng worker_profiles (FOR UPDATE) ngăn race condition khi 2 khách đánh giá 2 order khác nhau cùng worker đồng thời', async (ctx) => {
    if (!isPostgresAvailable) {
      ctx.skip();
      return;
    }

    const workerUserId = crypto.randomUUID();
    const customer1UserId = crypto.randomUUID();
    const customer2UserId = crypto.randomUUID();
    const workerProfileId = crypto.randomUUID();
    const order1Id = crypto.randomUUID();
    const order2Id = crypto.randomUUID();

    testUserIds.push(workerUserId, customer1UserId, customer2UserId);
    testWorkerProfileIds.push(workerProfileId);
    testOrderIds.push(order1Id, order2Id);

    // 1. Seed users & worker_profile
    await prisma.$queryRaw`
      INSERT INTO user_trust_service.users (id, full_name, status, created_at, updated_at)
      VALUES (${workerUserId}::uuid, 'Thợ Điện Nước Thử Nghiệm', 'active', NOW(), NOW()),
             (${customer1UserId}::uuid, 'Khách Hàng 1', 'active', NOW(), NOW()),
             (${customer2UserId}::uuid, 'Khách Hàng 2', 'active', NOW(), NOW())
    `;

    await prisma.$queryRaw`
      INSERT INTO user_trust_service.worker_profiles (id, user_id, status, average_rating, rating_count, created_at, updated_at)
      VALUES (${workerProfileId}::uuid, ${workerUserId}::uuid, 'verified', 0, 0, NOW(), NOW())
    `;

    // 2. Mock 2 orders hoàn thành khác nhau của cùng 1 worker
    const completedAt = new Date().toISOString();
    ordersMap.set(order1Id, {
      orderId: order1Id,
      orderCode: 'ORD-TEST-001',
      customerUserId: customer1UserId,
      workerUserId,
      status: 'completed',
      paymentState: 'paid',
      completedAt,
    });

    ordersMap.set(order2Id, {
      orderId: order2Id,
      orderCode: 'ORD-TEST-002',
      customerUserId: customer2UserId,
      workerUserId,
      status: 'completed',
      paymentState: 'paid',
      completedAt,
    });

    // 3. Thực hiện đồng thời 2 yêu cầu tạo đánh giá cho 2 đơn hàng khác nhau
    const [res1, res2] = await Promise.all([
      service.createReview(customer1UserId, {
        orderId: order1Id,
        rating: 5,
        attitudeRating: 'good',
        qualityRating: 'good',
        speedRating: 'good',
        comment: 'Đơn 1: Thợ làm cực kỳ tốt và nhanh chóng',
      }),
      service.createReview(customer2UserId, {
        orderId: order2Id,
        rating: 3,
        attitudeRating: 'neutral',
        qualityRating: 'neutral',
        speedRating: 'neutral',
        comment: 'Đơn 2: Thợ đến hơi trễ nhưng làm việc được',
      }),
    ]);

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);

    testReviewIds.push(res1.data.id, res2.data.id);

    // 4. Xác minh cả 2 đánh giá đã được lưu vào database
    const savedReviews = await prisma.workerReview.findMany({
      where: { workerUserId },
    });
    expect(savedReviews).toHaveLength(2);

    // 5. Xác minh thống kê worker_profiles khớp hoàn toàn và không bị race condition ghi đè
    const profileAfterCreate = await prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    expect(profileAfterCreate?.ratingCount).toBe(2);
    // Trung bình của (5 + 3) / 2 = 4.0
    expect(Number(profileAfterCreate?.averageRating)).toBe(4.0);

    // 6. Kiểm tra cập nhật đánh giá khi thay đổi rating (chuyển rating đơn 1 từ 5 sao xuống 1 sao)
    const updateRes = await service.updateReview(customer1UserId, res1.data.id, {
      rating: 1,
      comment: 'Cập nhật lại: Thiết bị bị hỏng lại sau 1 ngày',
    });
    expect(updateRes.data.rating).toBe(1);
    expect(updateRes.data.isEdited).toBe(true);

    // 7. Xác minh thống kê trung bình sau khi cập nhật: (1 + 3) / 2 = 2.0
    const profileAfterUpdate = await prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    expect(profileAfterUpdate?.ratingCount).toBe(2);
    expect(Number(profileAfterUpdate?.averageRating)).toBe(2.0);
  });
});

