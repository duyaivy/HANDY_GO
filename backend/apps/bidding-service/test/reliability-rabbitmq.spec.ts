import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/bidding-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';

function resolveTestDatabaseUrl(): string | undefined {
  const testUrl =
    process.env.DATABASE_URL_TEST ||
    process.env.DATABASE_URL_BIDDING_TEST ||
    process.env.DATABASE_URL_BIDDING;

  if (testUrl) return testUrl;

  const fallback = process.env.DATABASE_URL;
  if (fallback && process.env.NODE_ENV === 'test') {
    if (fallback.includes('supabase.co') && !fallback.includes('test')) {
      console.warn('⚠️ Prevented connecting to production Supabase database during test run.');
      return undefined;
    }
    return fallback;
  }
  return undefined;
}

const CONNECTION_STRING = resolveTestDatabaseUrl();

describe('Bidding Service: Architecture & Reliability Live Tests', { timeout: 30000 }, () => {
  let prisma: PrismaClient | null = null;
  const createdOutboxIds: string[] = [];
  const createdRoundIds: string[] = [];

  beforeAll(async () => {
    if (!CONNECTION_STRING) {
      console.warn('⚠️ No DATABASE_URL_BIDDING or DATABASE_URL_TEST provided. Skipping reliability tests.');
      return;
    }
    const adapter = new PrismaPg({ connectionString: CONNECTION_STRING });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    console.log('✅ Connected to DB for Reliability Testing.');
  });

  afterAll(async () => {
    if (prisma) {
      try {
        if (createdOutboxIds.length > 0) {
          await prisma.outboxEvent.deleteMany({
            where: { id: { in: createdOutboxIds } },
          });
        }
        if (createdRoundIds.length > 0) {
          await prisma.biddingRound.deleteMany({
            where: { id: { in: createdRoundIds } },
          });
        }
      } catch {
        // best-effort cleanup
      }
      await prisma.$disconnect();
    }
  });

  it('1. Outbox Relay Worker: Tự động quét event pending, publish sang RabbitMQ và chuyển sang published', async (ctx) => {
    if (!prisma) {
      ctx.skip();
      return;
    }
    const aggregateId = randomUUID();

    // 1.1 Ghi một sự kiện test vào bảng outbox_events ở trạng thái pending
    const createdEvent = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'test_reliability',
        aggregateId,
        eventType: 'test.reliability.ping',
        eventVersion: 1,
        payload: {
          message: 'Kiểm tra Outbox Relay Worker chạy ngầm',
          createdAt: new Date().toISOString(),
        },
        status: 'pending',
        nextRetryAt: new Date(Date.now() - 1000), // Sẵn sàng để worker quét ngay
      },
    });

    createdOutboxIds.push(createdEvent.id);
    expect(createdEvent).toBeDefined();
    expect(createdEvent.status).toBe('pending');
    console.log(`✅ [Outbox Test] Đã tạo OutboxEvent ID: ${createdEvent.id} với status: pending`);

    // 1.2 Chờ Outbox Relay Worker (poll mỗi 3 giây) quét và publish
    let isPublished = false;
    let publishedEvent = null;
    const startTime = Date.now();

    while (Date.now() - startTime < 12000) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      publishedEvent = await prisma.outboxEvent.findUnique({
        where: { id: createdEvent.id },
      });

      if (publishedEvent && publishedEvent.status === 'published') {
        isPublished = true;
        break;
      }
    }

    expect(isPublished).toBe(true);
    expect(publishedEvent?.status).toBe('published');
    expect(publishedEvent?.publishedAt).toBeDefined();

    console.log(
      `🎉 [Outbox Test] Outbox Relay Worker đã publish thành công ID: ${createdEvent.id} sang RabbitMQ lúc ${publishedEvent?.publishedAt?.toISOString()}`,
    );
  });

  it('2. Tự động đóng phiên khi hết hạn (Auto Round Expiration Worker)', async (ctx) => {
    if (!prisma) {
      ctx.skip();
      return;
    }
    const testRequestId = randomUUID();

    // 2.1 Tạo một phiên có closesAt trong quá khứ (-10 giây) nhưng status vẫn là 'open'
    const overdueRound = await prisma.biddingRound.create({
      data: {
        serviceRequestId: testRequestId,
        status: 'open',
        opensAt: new Date(Date.now() - 3600 * 1000), // Mở 1 tiếng trước
        closesAt: new Date(Date.now() - 10 * 1000),   // Đã quá hạn 10 giây trước
        bidCount: 0,
      },
    });

    createdRoundIds.push(overdueRound.id);
    expect(overdueRound).toBeDefined();
    expect(overdueRound.status).toBe('open');
    console.log(`✅ [Expiration Test] Đã tạo phiên quá hạn ID: ${overdueRound.id} với status: open`);

    // 2.2 Đợi Background Scheduler Worker (RoundExpirationSchedulerService) quét và tự động đóng phiên
    let isClosed = false;
    let finalRound = null;
    const startTime = Date.now();

    while (Date.now() - startTime < 20000) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      finalRound = await prisma.biddingRound.findUnique({
        where: { id: overdueRound.id },
      });

      if (finalRound && (finalRound.status === 'no_bid' || finalRound.status === 'closed')) {
        isClosed = true;
        break;
      }
    }

    expect(isClosed).toBe(true);
    expect(finalRound?.status).toBe('no_bid'); // Không có bid nên chuyển thành no_bid
    console.log(`🎉 [Expiration Test] Phiên ${overdueRound.id} đã TỰ ĐỘNG chuyển sang "${finalRound?.status}" mà không cần người dùng gọi API!`);

    // 2.3 Kiểm tra xem Outbox Event 'bidding.round.closed' đã được tự động tạo chưa
    const closeOutboxEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: overdueRound.id,
        eventType: 'bidding.round.closed',
      },
    });

    if (closeOutboxEvent) {
      createdOutboxIds.push(closeOutboxEvent.id);
    }

    expect(closeOutboxEvent).toBeDefined();
    console.log(`🎉 [Expiration Test] Sự kiện Outbox "bidding.round.closed" đã được ghi nhận ID: ${closeOutboxEvent?.id}`);
  });
});
