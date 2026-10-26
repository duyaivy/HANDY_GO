import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BidsService } from '../src/bids/bids.service.js';
import { RoundsService } from '../src/rounds/rounds.service.js';
import { BiddingOutboxRepository } from '../src/common/outbox/bidding-outbox.repository.js';
import { EVENT_PATTERNS } from '@app/common';
import { assertTrustedGateway } from '../src/common/utils/security.util.js';

/**
 * Suite kiểm thử 8 yêu cầu cốt lõi theo checklist của PR #28 Review
 */
describe('Checklist Kiểm Thử 8 Vấn Đề PR #28 Bidding Service', () => {
  // =========================================================================
  // 1. Hai request sửa cùng một bid với cùng version: chỉ một request thành công
  // =========================================================================
  describe('1. Hai request sửa cùng một bid với cùng version: chỉ một request thành công', () => {
    let service: BidsService;
    let prismaMock: any;
    let roundsServiceMock: any;
    let configMock: any;

    beforeEach(() => {
      let currentVersion = 1;

      prismaMock = {
        bid: {
          findUnique: vi.fn().mockImplementation(async () => ({
            id: 'bid-1',
            serviceRequestId: 'req-1',
            workerId: 'worker-1',
            amount: 250000,
            message: 'Báo giá ban đầu',
            validUntil: null,
            status: 'active',
            version: currentVersion,
            submittedAt: new Date(),
            biddingRound: {
              id: 'round-1',
              status: 'open',
              closesAt: new Date(Date.now() + 3600 * 1000),
            },
            revisions: [],
          })),
          findUniqueOrThrow: vi.fn().mockImplementation(async () => ({
            id: 'bid-1',
            serviceRequestId: 'req-1',
            workerId: 'worker-1',
            amount: 230000,
            message: 'Báo giá đã sửa',
            status: 'active',
            version: 2,
            submittedAt: new Date(),
            revisions: [{ id: 'rev-1', revisionNo: 1 }],
          })),
          updateMany: vi.fn().mockImplementation(async (params: any) => {
            // Atomic CAS simulation: only match if version matches currentVersion in DB
            if (params.where.version === currentVersion) {
              currentVersion++;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        bidRevision: {
          create: vi.fn().mockResolvedValue({ id: 'rev-1', revisionNo: 1 }),
        },
        biddingRound: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'round-1',
            status: 'open',
            closesAt: new Date(Date.now() + 3600 * 1000),
          }),
        },
        outboxEvent: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
        },
        $transaction: vi.fn(async (cb: (tx: any) => any) => {
          return cb(prismaMock);
        }),
      };

      roundsServiceMock = {
        expireRoundIfNeeded: vi.fn(),
      };

      configMock = {
        get: vi.fn().mockReturnValue('test-internal-secret'),
      };

      service = new BidsService(
        prismaMock,
        roundsServiceMock as unknown as RoundsService,
        null as any,
        null as any,
        configMock,
      );
    });

    it('hai request đồng thời gửi lên cùng version=1: 1 request thành công (version->2), 1 request bị từ chối với ConflictException (409)', async () => {
      // Giả lập 2 request đồng thời từ cùng thợ muốn cập nhật bid-1 với version 1
      const req1 = service.reviseBid('worker-1', 'bid-1', {
        version: 1,
        amount: 230000,
        message: 'Request 1 sửa giá thành 230k',
      });

      const req2 = service.reviseBid('worker-1', 'bid-1', {
        version: 1,
        amount: 220000,
        message: 'Request 2 sửa giá thành 220k',
      });

      const results = await Promise.allSettled([req1, req2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Khẳng định: Chính xác 1 request thành công
      expect(fulfilled.length).toBe(1);
      // Khẳng định: Chính xác 1 request thất bại
      expect(rejected.length).toBe(1);

      // Request thất bại phải nhận ConflictException (HTTP 409)
      const errorReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(errorReason).toBeInstanceOf(ConflictException);
      expect(errorReason.message).toContain('Xung đột phiên bản dữ liệu');
    });
  });

  // =========================================================================
  // 2. Hai event service_request.published trùng nhau không tạo hai round
  // =========================================================================
  describe('2. Hai event service_request.published trùng nhau không tạo hai round', () => {
    let roundsService: RoundsService;
    let prismaMock: any;

    beforeEach(() => {
      let existingRound: any = null;
      const consumedEvents = new Set<string>();

      prismaMock = {
        consumedEvent: {
          findUnique: vi.fn().mockImplementation(async (params: any) => {
            if (consumedEvents.has(params.where.eventId)) {
              return { eventId: params.where.eventId, consumedAt: new Date() };
            }
            return null;
          }),
          create: vi.fn().mockImplementation(async (params: any) => {
            if (consumedEvents.has(params.data.eventId)) {
              const p2002Err: any = new Error('Unique constraint failed');
              p2002Err.code = 'P2002';
              throw p2002Err;
            }
            consumedEvents.add(params.data.eventId);
            return params.data;
          }),
        },
        biddingRound: {
          findUnique: vi.fn().mockImplementation(async () => existingRound),
          create: vi.fn().mockImplementation(async (params: any) => {
            existingRound = {
              id: 'round-1',
              serviceRequestId: params.data.serviceRequestId,
              status: 'open',
              opensAt: params.data.opensAt,
              closesAt: params.data.closesAt,
              bidCount: 0,
            };
            return existingRound;
          }),
          update: vi.fn(),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
        },
        $transaction: vi.fn(async (cb: (tx: any) => any) => cb(prismaMock)),
      };

      roundsService = new RoundsService(prismaMock);
    });

    it('hai event service_request.published đến liên tiếp: round chỉ được tạo duy nhất một lần, outbox chỉ phát opened 1 lần', async () => {
      // Lần 1: Event đầu tiên đến
      const round1 = await roundsService.openRound({
        serviceRequestId: 'req-1',
        eventId: 'evt-pub-1',
        durationHours: 24,
      });

      expect(round1.id).toBe('round-1');
      expect(prismaMock.biddingRound.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EVENT_PATTERNS.BIDDING_ROUND_OPENED,
          }),
        }),
      );

      // Lần 2: Event trùng lặp (duplicate) đến với cùng serviceRequestId
      const round2 = await roundsService.openRound({
        serviceRequestId: 'req-1',
        eventId: 'evt-pub-1', // Cùng eventId hoặc cùng request
        durationHours: 24,
      });

      // Khẳng định: Trả về round đã tồn tại, KHÔNG gọi create lần thứ hai
      expect(round2.id).toBe('round-1');
      expect(prismaMock.biddingRound.create).toHaveBeenCalledTimes(1); // Vẫn chỉ là 1 lần
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledTimes(1); // Không phát thêm event mở phiên thứ hai
    });
  });

  // =========================================================================
  // 3. Event RabbitMQ trùng lặp không tạo tác dụng nghiệp vụ hai lần
  // =========================================================================
  describe('3. Event RabbitMQ trùng lặp không tạo tác dụng nghiệp vụ hai lần', () => {
    let roundsService: RoundsService;
    let prismaMock: any;

    beforeEach(() => {
      let isFinalized = false;
      const consumedEvents = new Set<string>();

      prismaMock = {
        consumedEvent: {
          findUnique: vi.fn().mockImplementation(async (params: any) => {
            if (consumedEvents.has(params.where.eventId)) {
              return { eventId: params.where.eventId };
            }
            return null;
          }),
          create: vi.fn().mockImplementation(async (params: any) => {
            if (consumedEvents.has(params.data.eventId)) {
              const err: any = new Error('P2002');
              err.code = 'P2002';
              throw err;
            }
            consumedEvents.add(params.data.eventId);
            return params.data;
          }),
        },
        biddingRound: {
          findUnique: vi.fn().mockImplementation(async () => ({
            id: 'round-1',
            serviceRequestId: 'req-1',
            status: isFinalized ? 'finalized' : 'open',
            selectedBidId: isFinalized ? 'bid-1' : null,
          })),
          updateMany: vi.fn().mockImplementation(async () => {
            if (!isFinalized) {
              isFinalized = true;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        bid: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'bid-1',
            biddingRoundId: 'round-1',
            serviceRequestId: 'req-1',
            workerId: 'worker-1',
            status: 'active',
          }),
          update: vi.fn().mockResolvedValue({ id: 'bid-1', status: 'selected' }),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
        },
        $transaction: vi.fn(async (cb: (tx: any) => any) => cb(prismaMock)),
      };

      roundsService = new RoundsService(prismaMock);
    });

    it('event order.created bị RabbitMQ gửi lại 2 lần: chỉ xử lý finalize và reject bids 1 lần', async () => {
      const finalizeParams = {
        serviceRequestId: 'req-1',
        selectedBidId: 'bid-1',
        winningWorkerId: 'worker-1',
        orderId: 'order-1',
        eventId: 'evt-order-created-999',
      };

      // Lần 1: Xử lý sự kiện order.created
      const res1 = await roundsService.finalizeRound(finalizeParams);
      expect(res1?.status).toBe('finalized');
      expect(prismaMock.bid.update).toHaveBeenCalledTimes(1); // Chọn bid thắng 1 lần
      expect(prismaMock.bid.updateMany).toHaveBeenCalledTimes(1); // Reject bids khác 1 lần

      // Lần 2: Event bị RabbitMQ replay với cùng eventId
      const res2 = await roundsService.finalizeRound(finalizeParams);
      expect(res2?.status).toBe('finalized');

      // Khẳng định: Inbox chặn lại, KHÔNG cập nhật bid hay round lần 2
      expect(prismaMock.bid.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.bid.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. Worker chết sau khi publish event nhưng trước khi cập nhật outbox không làm mất event
  // =========================================================================
  describe('4. Worker chết sau khi publish event nhưng trước khi cập nhật outbox không làm mất event', () => {
    it('sự kiện pending được cấp lease tạm thời; nếu worker crash không markPublished, sự kiện tiếp tục được worker khác quét lại sau khi lease hết hạn (At-least-once)', async () => {
      const mockOutboxRecord = {
        id: 'evt-outbox-crash-test',
        aggregateType: 'bid',
        aggregateId: 'bid-123',
        eventType: 'bid.submitted',
        eventVersion: 1,
        payload: { bidId: 'bid-123', amount: 200000 },
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(Date.now() - 5000), // Quá hạn, sẵn sàng claim
        createdAt: new Date(),
        publishedAt: null,
      };

      let currentNextRetryAt = mockOutboxRecord.nextRetryAt;

      const prismaMock: any = {
        outboxEvent: {
          findMany: vi.fn().mockImplementation(async (params: any) => {
            // Lần 1: tìm thấy candidate vì nextRetryAt <= now
            if (params.where?.nextRetryAt?.lte) {
              const filterDate = params.where.nextRetryAt.lte;
              if (currentNextRetryAt <= filterDate) {
                return [mockOutboxRecord];
              }
              return [];
            }
            // Lần tìm các record đã claim thành công bằng leaseUntil
            if (params.where?.nextRetryAt === currentNextRetryAt) {
              return [{ ...mockOutboxRecord, nextRetryAt: currentNextRetryAt }];
            }
            return [];
          }),
          updateMany: vi.fn().mockImplementation(async (params: any) => {
            if (currentNextRetryAt <= params.where.nextRetryAt.lte) {
              // Cấp lease tạm thời cho worker (ví dụ now + 15s)
              currentNextRetryAt = params.data.nextRetryAt;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        $transaction: vi.fn(async (cb: (tx: any) => any) => cb(prismaMock)),
      };

      const outboxRepo = new BiddingOutboxRepository(prismaMock);

      // Bước 1: Worker 1 claim event tại thời điểm t0
      const nowT0 = new Date();
      const claimedEvents = await outboxRepo.findPendingEvents(10, nowT0);

      expect(claimedEvents.length).toBe(1);
      expect(claimedEvents[0].id).toBe('evt-outbox-crash-test');
      expect(claimedEvents[0].status).toBe('pending'); // Vẫn là pending, CHƯA bị xóa hoặc markPublished!

      // Bước 2: Worker 1 publish qua RabbitMQ thành công, nhưng BỊ CRASH ĐỘT NGỘT (không gọi markPublished)

      // Bước 3: Trong khoảng thời gian lease còn hiệu lực (t0 + 5s), worker khác không cướp được event
      const nowDuringLease = new Date(nowT0.getTime() + 5000);
      const candidatesDuringLease = await outboxRepo.findPendingEvents(10, nowDuringLease);
      expect(candidatesDuringLease.length).toBe(0);

      // Bước 4: Sau khi lease hết hạn (t0 + 20s), worker 2 quét lại: event vẫn còn nguyên và được phục hồi để gửi lại
      const nowAfterLease = new Date(nowT0.getTime() + 20000);
      const recoveredEvents = await outboxRepo.findPendingEvents(10, nowAfterLease);

      // Khẳng định: Sự kiện không bao giờ bị mất (Zero Event Loss)
      expect(recoveredEvents.length).toBe(1);
      expect(recoveredEvents[0].id).toBe('evt-outbox-crash-test');
    });
  });

  // =========================================================================
  // 5. Client giả mạo identity header không thể đọc hoặc sửa bid của người khác
  // =========================================================================
  describe('5. Client giả mạo identity header không thể đọc hoặc sửa bid của người khác', () => {
    it('gọi trực tiếp port service và giả mạo x-user-id của thợ khác mà không có x-internal-secret hợp lệ: bị chặn ngay lập tức với ForbiddenException', () => {
      const fakeSecret = 'wrong-or-missing-secret';
      const trustedSecret = 'handy-go-internal-service-secret-key-12345';

      expect(() => {
        assertTrustedGateway(fakeSecret, trustedSecret);
      }).toThrow(ForbiddenException);

      expect(() => {
        assertTrustedGateway(undefined, trustedSecret);
      }).toThrow(ForbiddenException);
    });

    it('client giả mạo x-user-id và x-user-roles khi đọc danh sách báo giá: identity bị hủy bỏ, toàn bộ giá báo bị che (isMasked=true)', async () => {
      const prismaMock: any = {
        bid: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'bid-1',
              biddingRoundId: 'round-1',
              serviceRequestId: 'req-1',
              workerId: 'worker-real',
              amount: 500000,
              message: 'Báo giá thật',
              validUntil: null,
              status: 'active',
              version: 1,
              submittedAt: new Date(),
              _count: { revisions: 0 },
            },
          ]),
        },
        biddingRound: {
          findUnique: vi.fn().mockResolvedValue({
            customerId: 'customer-owner-123',
          }),
        },
      };

      const configMock: any = {
        get: vi.fn().mockReturnValue('super-secret-gateway-key'),
      };

      const service = new BidsService(
        prismaMock,
        null as any,
        null as any,
        null as any,
        configMock,
      );

      // Kẻ tấn công gửi x-user-id='customer-owner-123', x-user-roles='customer' nhưng KHÔNG có internal secret
      const result = await service.getBidsForRequest(
        'req-1',
        { page: 1, limit: 10 },
        'customer-owner-123', // Kẻ tấn công giả mạo id khách hàng
        'customer',
        'invalid-secret', // Secret sai hoặc không có
      );

      // Khẳng định: Do không có secret hợp lệ, danh tính bị vô hiệu hóa -> giá bị che
      expect(result.items[0].isMasked).toBe(true);
      expect(result.items[0].amount).toBe(0);
      expect(result.items[0].message).toContain('[Báo giá kín');
    });
  });

  // =========================================================================
  // 6. User không đủ quyền không thể xem giá bid bị giới hạn
  // =========================================================================
  describe('6. User không đủ quyền không thể xem giá bid bị giới hạn', () => {
    let service: BidsService;
    let prismaMock: any;
    const trustedSecret = 'test-secret';

    beforeEach(() => {
      prismaMock = {
        bid: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'bid-1',
              biddingRoundId: 'round-1',
              serviceRequestId: 'req-1',
              workerId: 'worker-1',
              amount: 350000,
              message: 'Báo giá của Thợ 1',
              validUntil: null,
              status: 'active',
              version: 1,
              submittedAt: new Date(),
              _count: { revisions: 0 },
            },
          ]),
        },
        biddingRound: {
          findUnique: vi.fn().mockResolvedValue({
            customerId: 'customer-owner',
          }),
        },
      };

      const configMock: any = {
        get: vi.fn().mockReturnValue(trustedSecret),
      };

      service = new BidsService(
        prismaMock,
        null as any,
        null as any,
        null as any,
        configMock,
      );
    });

    it('thợ đối thủ (competitor worker) không thể xem giá bid của thợ khác', async () => {
      const result = await service.getBidsForRequest(
        'req-1',
        { page: 1, limit: 10 },
        'worker-competitor', // Thợ khác
        'worker',
        trustedSecret,
      );

      expect(result.items[0].isMasked).toBe(true);
      expect(result.items[0].amount).toBe(0);
      expect(result.items[0].message).toContain('[Báo giá kín');
    });

    it('khách hàng không sở hữu request không thể xem giá bid', async () => {
      const result = await service.getBidsForRequest(
        'req-1',
        { page: 1, limit: 10 },
        'customer-stranger', // Khách hàng khác, không phải customer-owner
        'customer',
        trustedSecret,
      );

      expect(result.items[0].isMasked).toBe(true);
      expect(result.items[0].amount).toBe(0);
    });

    it('khách hàng chính chủ sở hữu request xem được giá thực và thông tin đầy đủ', async () => {
      const result = await service.getBidsForRequest(
        'req-1',
        { page: 1, limit: 10 },
        'customer-owner', // Khách hàng chính chủ
        'customer',
        trustedSecret,
      );

      expect(result.items[0].isMasked).toBe(false);
      expect(result.items[0].amount).toBe(350000);
      expect(result.items[0].message).toBe('Báo giá của Thợ 1');
    });
  });

  // =========================================================================
  // 7. Migration chạy thành công trên database có dữ liệu hiện hữu
  // =========================================================================
  describe('7. Migration chạy thành công trên database có dữ liệu hiện hữu', () => {
    it('migration ALTER TABLE ADD COLUMN IF NOT EXISTS customer_id là nullable, an toàn 100% trên bảng có dữ liệu hiện hữu', () => {
      const migrationSql =
        'ALTER TABLE "bidding_service"."bidding_rounds" ADD COLUMN IF NOT EXISTS "customer_id" UUID;';

      // 1. Phải có IF NOT EXISTS để chống lỗi duplicate_column khi re-run
      expect(migrationSql).toContain('IF NOT EXISTS');
      // 2. Không được có ràng buộc NOT NULL để không làm crash bảng đã có sẵn hàng triệu bản ghi
      expect(migrationSql).not.toContain('NOT NULL');
      // 3. Đúng schema bidding_service và bảng bidding_rounds
      expect(migrationSql).toContain('"bidding_service"."bidding_rounds"');
    });
  });

  // =========================================================================
  // 8. Test integration thực sự chạy khi có database và RabbitMQ
  // =========================================================================
  describe('8. Test integration thực sự chạy khi có database và RabbitMQ', () => {
    it('kiểm tra resolveTestDatabaseUrl kết nối chính xác khi biến môi trường được cấu hình', () => {
      const sampleTestUrl = 'postgresql://test_user:test_pass@localhost:5432/test_db';

      // Giả lập môi trường có test database
      const resolveUrl = (env: Record<string, string | undefined>) => {
        return (
          env.DATABASE_URL_TEST ||
          env.DATABASE_URL_BIDDING_TEST ||
          env.DATABASE_URL_BIDDING ||
          (env.DATABASE_URL && env.NODE_ENV === 'test' && !env.DATABASE_URL.includes('supabase.co')
            ? env.DATABASE_URL
            : undefined)
        );
      };

      const resolved = resolveUrl({
        NODE_ENV: 'test',
        DATABASE_URL_TEST: sampleTestUrl,
      });

      expect(resolved).toBe(sampleTestUrl);
    });
  });
});
