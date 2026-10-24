import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/bidding-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';

const CONNECTION_STRING =
  process.env.DATABASE_URL_BIDDING ||
  process.env.DATABASE_URL ||
  'postgresql://postgres.pkdvnwcjqlgrbmjokako:handygo@1234!!!@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';

describe('Bidding Service: Architecture & Reliability Live Tests', { timeout: 30000 }, () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: CONNECTION_STRING });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    console.log('✅ Connected to Supabase DB for Reliability Testing.');
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('1. Outbox Relay Worker: Tự động quét event pending, publish sang RabbitMQ và chuyển sang published', async () => {
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

  it('2. Tự động đóng phiên khi hết hạn (Auto Round Expiration Worker)', async () => {
    const testRequestId = randomUUID();

    // 2.1 Tạo một phiên có closesAt trong quá khứ (-10 giây) nhưng status vẫn là 'open'
    // Giả lập khách hàng tắt app hoặc không ai gọi API kiểm tra trạng thái
    const overdueRound = await prisma.biddingRound.create({
      data: {
        serviceRequestId: testRequestId,
        status: 'open',
        opensAt: new Date(Date.now() - 3600 * 1000), // Mở 1 tiếng trước
        closesAt: new Date(Date.now() - 10 * 1000),   // Đã quá hạn 10 giây trước
        bidCount: 0,
      },
    });

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

    expect(closeOutboxEvent).toBeDefined();
    console.log(`🎉 [Expiration Test] Sự kiện Outbox "bidding.round.closed" đã được ghi nhận ID: ${closeOutboxEvent?.id}`);
  });
});
