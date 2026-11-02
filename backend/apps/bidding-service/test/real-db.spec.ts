import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/bidding-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.BIDDING_SERVICE_URL || 'http://localhost:3005';
const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ||
  'handy-go-internal-service-secret-key-12345';

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

describe('Bidding Service Real Database Integration Test', { timeout: 20000 }, () => {
  let prisma: PrismaClient | null = null;
  const testRequestId = randomUUID();
  const testCustomerId = randomUUID();
  const worker1Id = randomUUID();
  const worker2Id = randomUUID();
  let createdRoundId: string;
  let bid1Id: string;
  let bid2Id: string;
  let isHttpServiceAvailable = false;

  beforeAll(async () => {
    if (!CONNECTION_STRING) {
      console.warn('⚠️ No DATABASE_URL_BIDDING or DATABASE_URL_TEST provided. Skipping real DB tests.');
      return;
    }
    const adapter = new PrismaPg({ connectionString: CONNECTION_STRING });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL database.');

    try {
      const res = await fetch(`${BASE_URL}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      isHttpServiceAvailable = res.status === 200;
    } catch {
      isHttpServiceAvailable = false;
      console.warn(
        `⚠️ Bidding Service HTTP is not reachable at ${BASE_URL}. Skipping live HTTP API integration steps on CI runner.`,
      );
    }
  });

  afterAll(async () => {
    if (prisma) {
      try {
        if (createdRoundId) {
          await prisma.bidRevision.deleteMany({
            where: { bid: { biddingRoundId: createdRoundId } },
          });
          await prisma.bid.deleteMany({
            where: { biddingRoundId: createdRoundId },
          });
          const targetIds = [createdRoundId, bid1Id, bid2Id].filter(Boolean) as string[];
          if (targetIds.length > 0) {
            await prisma.outboxEvent.deleteMany({
              where: { aggregateId: { in: targetIds } },
            });
          }
          await prisma.biddingRound.delete({
            where: { id: createdRoundId },
          });
        }
      } catch {
        // best-effort cleanup
      }
      await prisma.$disconnect();
    }
  });

  it('Bước 1: Tạo phiên báo giá thực tế trong DB Supabase (Bidding Round)', async (ctx) => {
    if (!prisma) {
      ctx.skip();
      return;
    }
    const round = await prisma.biddingRound.create({
      data: {
        serviceRequestId: testRequestId,
        customerId: testCustomerId,
        status: 'open',
        opensAt: new Date(),
        closesAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // +2 hours
        bidCount: 0,
      },
    });

    expect(round).toBeDefined();
    expect(round.id).toBeDefined();
    expect(round.serviceRequestId).toBe(testRequestId);
    expect(round.status).toBe('open');
    createdRoundId = round.id;

    console.log(`✅ [DB] Đã tạo BiddingRound ID: ${createdRoundId} cho Request: ${testRequestId}`);
  });

  it('Bước 2: Gọi API GET /api/v1/requests/:id/bidding-status để kiểm tra trạng thái phiên', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/v1/requests/${testRequestId}/bidding-status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe('open');
    expect(body.data.isExpired).toBe(false);
    expect(body.data.timeRemainingSeconds).toBeGreaterThan(0);
    expect(body.data.activeBidCount).toBe(0);

    console.log(`✅ [API] Lấy trạng thái phiên thành công: ${body.data.status}, còn lại ${body.data.timeRemainingSeconds}s`);
  });

  it('Bước 3: Thợ 1 gửi báo giá 350.000 VNĐ qua POST /api/v1/requests/:id/bids và lưu vào DB', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/v1/requests/${testRequestId}/bids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': worker1Id,
        'x-user-roles': 'worker',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        amount: 350000,
        message: 'Thợ điện lạnh chuyên nghiệp, có mặt sau 30 phút.',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    bid1Id = body.data.id;
    expect(body.data.amount).toBe(350000);
    expect(body.data.status).toBe('active');
    expect(body.data.version).toBe(1);

    // Verify trong DB Supabase
    const dbBid = await prisma.bid.findUnique({
      where: { id: bid1Id },
    });
    expect(dbBid).not.toBeNull();
    expect(Number(dbBid!.amount)).toBe(350000);
    expect(dbBid!.status).toBe('active');
    expect(dbBid!.workerId).toBe(worker1Id);

    // Verify Outbox Event trong DB
    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: bid1Id,
        eventType: 'bid.submitted',
      },
    });
    expect(outbox).not.toBeNull();

    console.log(`✅ [DB & API] Thợ 1 gửi báo giá thành công. Bid ID: ${bid1Id}, Outbox ID: ${outbox?.id}`);
  });

  it('Bước 4: Chống gửi trùng lặp (Cùng Thợ 1 gửi lại cùng request -> Bị từ chối 409 Conflict)', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/v1/requests/${testRequestId}/bids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': worker1Id,
        'x-user-roles': 'worker',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        amount: 340000,
      }),
    });

    expect(res.status).toBe(409);
    console.log(`✅ [API] Chặn gửi trùng lặp thành công (HTTP 409 Conflict)`);
  });

  it('Bước 5: Thợ 2 gửi báo giá 320.000 VNĐ qua POST /api/v1/requests/:id/bids', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/v1/requests/${testRequestId}/bids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': worker2Id,
        'x-user-roles': 'worker',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        amount: 320000,
        message: 'Thợ gần khu vực, nhận sửa ngay.',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    bid2Id = body.data.id;

    // Kiểm tra round trong DB đã tăng bidCount lên 2
    const round = await prisma.biddingRound.findUnique({
      where: { id: createdRoundId },
    });
    expect(round?.bidCount).toBe(2);

    console.log(`✅ [DB & API] Thợ 2 gửi báo giá thành công. Bid ID: ${bid2Id}, Round bids count: ${round?.bidCount}`);
  });

  it('Bước 6: Thợ 1 điều chỉnh báo giá xuống 300.000 VNĐ qua PATCH /api/v1/bids/:id (Lưu Revision trong DB)', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/v1/bids/${bid1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': worker1Id,
        'x-user-roles': 'worker',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        amount: 300000,
        version: 1, // Khóa lạc quan (optimistic locking)
        message: 'Giảm giá 50k hỗ trợ khách hàng',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.amount).toBe(300000);
    expect(body.data.version).toBe(2);
    expect(body.data.revisionsCount).toBe(1);

    // Verify DB: Kiểm tra bảng bid_revisions được tạo thật
    const revision = await prisma.bidRevision.findFirst({
      where: { bidId: bid1Id },
      orderBy: { revisionNo: 'desc' },
    });
    expect(revision).not.toBeNull();
    expect(Number(revision!.previousAmount)).toBe(350000);
    expect(Number(revision!.newAmount)).toBe(300000);
    expect(revision!.revisionNo).toBe(1);

    console.log(`✅ [DB] Bản ghi lịch sử điều chỉnh (bid_revisions) đã được lưu: từ ${revision?.previousAmount}đ -> ${revision?.newAmount}đ`);
  });

  it('Bước 7: Thợ 2 rút báo giá qua POST /api/v1/bids/:id/withdraw (Lưu status withdrawn)', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/v1/bids/${bid2Id}/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': worker2Id,
        'x-user-roles': 'worker',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        version: 1,
        reason: 'Có việc bận đột xuất, xin rút báo giá',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('withdrawn');

    // Verify DB: bid2 status là withdrawn
    const dbBid2 = await prisma.bid.findUnique({
      where: { id: bid2Id },
    });
    expect(dbBid2!.status).toBe('withdrawn');

    console.log(`✅ [DB] Trạng thái báo giá của Thợ 2 đã cập nhật thành: ${dbBid2!.status}`);
  });

  it('Bước 8: Khách hàng xem danh sách báo giá qua GET /api/v1/requests/:id/bids', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/v1/requests/${testRequestId}/bids`, {
      headers: {
        'x-user-id': testCustomerId,
        'x-user-roles': 'customer',
        'x-internal-secret': INTERNAL_SECRET,
      },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);

    const activeBid = body.data.items.find((b: { id: string }) => b.id === bid1Id);
    expect(activeBid).toBeDefined();
    expect(activeBid.status).toBe('active');
    // Bắt buộc: Xem báo giá không được chuyển trạng thái sang selected
    expect(activeBid.status).not.toBe('selected');

    console.log(`✅ [API] Lấy danh sách báo giá thành công. Trạng thái của Bid 1 vẫn là "${activeBid.status}" (không bị đổi sang selected).`);
  });

  it('Bước 9: Order Service gọi Internal API kiểm tra tính hợp lệ (Eligibility) của báo giá', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    // 9.1: Kiểm tra Bid 1 của thợ 1 -> Đủ điều kiện
    const res1 = await fetch(
      `${BASE_URL}/api/v1/internal/bids/${bid1Id}/eligibility?requestId=${testRequestId}&workerId=${worker1Id}`,
      {
        headers: {
          'x-internal-secret': INTERNAL_SECRET,
        },
      },
    );
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data.eligible).toBe(true);
    expect(body1.data.bid.amount).toBe(300000);

    // 9.2: Kiểm tra Bid 2 đã rút -> Không đủ điều kiện
    const res2 = await fetch(
      `${BASE_URL}/api/v1/internal/bids/${bid2Id}/eligibility?requestId=${testRequestId}&workerId=${worker2Id}`,
      {
        headers: {
          'x-internal-secret': INTERNAL_SECRET,
        },
      },
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.data.eligible).toBe(false);

    console.log(`✅ [Internal API] Kiểm tra Eligibility: Bid 1 hợp lệ (${body1.data.eligible}), Bid 2 không hợp lệ (${body2.data.eligible} - ${body2.data.reason})`);
  });

  it('Bước 10: Tổng kết dữ liệu thực tế đã lưu trong Supabase PostgreSQL', async (ctx) => {
    if (!isHttpServiceAvailable) {
      ctx.skip();
      return;
    }

    const roundInDb = await prisma.biddingRound.findUnique({
      where: { id: createdRoundId },
    });
    const bidsInDb = await prisma.bid.findMany({
      where: { biddingRoundId: createdRoundId },
      include: { revisions: true },
    });
    const targetIds = [createdRoundId, bid1Id, bid2Id].filter(Boolean) as string[];
    const outboxInDb = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: { in: targetIds },
      },
    });

    console.log('\n================================================================');
    console.log('🎉 TỔNG KẾT DỮ LIỆU ĐÃ LƯU THỰC TẾ TRÊN SUPABASE CLOUD DATABASE:');
    console.log('================================================================');
    console.log(`1. BiddingRound (ID: ${roundInDb?.id}):`);
    console.log(`   - ServiceRequestId: ${roundInDb?.serviceRequestId}`);
    console.log(`   - Status: ${roundInDb?.status}, Bids Count: ${roundInDb?.bidCount}`);
    console.log(`2. Bids (${bidsInDb.length} bản ghi):`);
    bidsInDb.forEach((b, idx) => {
      console.log(`   [${idx + 1}] ID: ${b.id}`);
      console.log(`       Worker: ${b.workerId}, Amount: ${b.amount} VNĐ, Status: ${b.status}, Version: ${b.version}`);
      console.log(`       Revisions count: ${b.revisions.length}`);
    });
    console.log(`3. Outbox Events (${outboxInDb.length} sự kiện được ghi):`);
    outboxInDb.forEach((o, idx) => {
      console.log(`   [${idx + 1}] Type: ${o.eventType}, AggregateId: ${o.aggregateId}, Status: ${o.status}`);
    });
    console.log('================================================================\n');

    expect(bidsInDb.length).toBe(2);
    expect(outboxInDb.length).toBeGreaterThanOrEqual(2);
  });
});
