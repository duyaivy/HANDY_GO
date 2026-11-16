import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserTrustServiceService } from '../src/user-trust-service.service.js';
import { UserTrustServiceController } from '../src/user-trust-service.controller.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegisterRole } from '@app/auth';

describe('User Review Flow Test Suite (HG-68)', () => {
  const customerUserId = '4bb6e3d4-6b59-4ee7-b28a-a4f436234328'; // Trần Quốc Bảo
  const workerUserId = '1377604f-84e3-46d7-bae2-0c1c862bd021';   // Lê Thu Hà
  const workerProfileId = '754f46bb-e7ca-4a9a-86be-79851fdf77b2';
  const orderId = '5db02c75-3712-48a2-9a98-ba84a0feb207';

  let service: UserTrustServiceService;
  let controller: UserTrustServiceController;
  let dbMock: any;
  let orderClientMock: any;
  let cloudinaryMock: any;

  beforeEach(() => {
    dbMock = {
      workerReview: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        aggregate: vi.fn(),
      },
      workerProfile: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(dbMock)),
    };

    orderClientMock = {
      getOrder: vi.fn(),
    };

    cloudinaryMock = {
      uploadImage: vi.fn(),
      createVideoUploadSignature: vi.fn(),
    };

    service = new UserTrustServiceService(
      dbMock,
      undefined,
      cloudinaryMock,
      undefined,
      orderClientMock,
    );

    controller = new UserTrustServiceController(service);
  });

  const customerUser = {
    accountId: 'acc-cust-1',
    userId: customerUserId,
    sessionId: 'sess-1',
    roles: [RegisterRole.CUSTOMER],
    permissions: ['profile:read', 'profile:update'],
  };

  const workerUser = {
    accountId: 'acc-work-1',
    userId: workerUserId,
    sessionId: 'sess-2',
    roles: [RegisterRole.WORKER],
    permissions: ['profile:read', 'profile:update'],
  };

  describe('1. Khách hàng tạo đánh giá đơn hàng (Customer creates review)', () => {
    it('Tạo đánh giá thành công khi đơn hàng đã completed với đủ sao, nhận xét, ảnh và video', async () => {
      // Mock order từ OrderClient
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        orderCode: 'ORD-47099855',
        status: 'completed',
        customerUserId,
        workerUserId,
      });

      // Mock chưa có review
      dbMock.workerReview.findUnique.mockResolvedValue(null);

      // Mock tìm thấy thợ
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        ratingCount: 15,
        averageRating: 4.90,
      });

      // Mock aggregate rating sau khi đánh giá
      dbMock.workerReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.95 },
        _count: { rating: 16 },
      });

      // Mock create review
      const mockCreatedReview = {
        id: 'rev-uuid-001',
        orderId,
        customerUserId,
        workerUserId,
        rating: 5,
        attitudeRating: 'good',
        qualityRating: 'good',
        speedRating: 'good',
        comment: 'Thợ Lê Thu Hà làm việc rất chuyên nghiệp, xử lý sự cố nhanh và chu đáo!',
        status: 'published',
        createdAt: new Date(),
        media: [
          {
            id: 'med-img-1',
            mediaType: 'image',
            mediaUrl: 'https://res.cloudinary.com/dcf78vkol/image/upload/sample.jpg',
            thumbnailUrl: null,
            createdAt: new Date(),
          },
          {
            id: 'med-vid-1',
            mediaType: 'video',
            mediaUrl: 'https://res.cloudinary.com/dcf78vkol/video/upload/sample.mp4',
            thumbnailUrl: 'https://res.cloudinary.com/dcf78vkol/video/upload/sample.jpg',
            createdAt: new Date(),
          },
        ],
        customer: { id: customerUserId, fullName: 'Trần Quốc Bảo', avatarUrl: null },
        worker: { id: workerUserId, fullName: 'Lê Thu Hà', avatarUrl: null },
      };
      dbMock.workerReview.create.mockResolvedValue(mockCreatedReview);

      const reviewDto = {
        orderId,
        workerUserId,
        rating: 5,
        attitudeRating: 'good',
        qualityRating: 'good',
        speedRating: 'good',
        comment: 'Thợ Lê Thu Hà làm việc rất chuyên nghiệp, xử lý sự cố nhanh và chu đáo!',
        media: [
          { mediaType: 'image' as const, mediaUrl: 'https://res.cloudinary.com/dcf78vkol/image/upload/sample.jpg' },
          { mediaType: 'video' as const, mediaUrl: 'https://res.cloudinary.com/dcf78vkol/video/upload/sample.mp4', thumbnailUrl: 'https://res.cloudinary.com/dcf78vkol/video/upload/sample.jpg' },
        ],
      };

      const result: any = await controller.createReview(customerUser, reviewDto);

      expect(result.statusCode).toBe(201);
      expect(result.data.id).toBe('rev-uuid-001');
      expect(result.data.rating).toBe(5);
      expect(result.data.media).toHaveLength(2);
      expect(result.data.media[0].mediaType).toBe('image');
      expect(result.data.media[1].mediaType).toBe('video');
      expect(dbMock.workerProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: workerUserId },
        data: expect.objectContaining({ ratingCount: 16 }),
      });
      expect(dbMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'review.created' }),
        }),
      );
    });

    it('Chặn đánh giá trùng lặp (ConflictException 409 khi đơn đã có đánh giá)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue({ id: 'existing-rev' });

      await expect(
        service.createReview(customerUserId, { orderId, rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('Chặn đánh giá nếu đơn hàng chưa hoàn thành (BadRequestException khi status != completed)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'in_progress', // Chưa completed
        customerUserId,
        workerUserId,
      });

      await expect(
        service.createReview(customerUserId, { orderId, rating: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Chặn người dùng lạ không phải khách hàng của đơn (ForbiddenException 403)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'completed',
        customerUserId: 'someone-else-uuid', // Không phải Trần Quốc Bảo
        workerUserId,
      });

      await expect(
        service.createReview(customerUserId, { orderId, rating: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Khách hàng xem danh sách đánh giá của thợ qua đấu giá / profile (Customer views worker reviews)', () => {
    it('Trả về đầy đủ thông tin thợ, thống kê sao, danh sách đánh giá có media khi truyền workerUserId', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        ratingCount: 16,
        averageRating: 4.95,
        user: { fullName: 'Lê Thu Hà', avatarUrl: 'https://avatar.png' },
      });

      dbMock.workerReview.groupBy.mockResolvedValue([
        { rating: 5, _count: { rating: 15 } },
        { rating: 4, _count: { rating: 1 } },
      ]);

      dbMock.workerReview.findMany.mockResolvedValue([
        {
          id: 'rev-uuid-001',
          orderId,
          rating: 5,
          attitudeRating: 'good',
          qualityRating: 'good',
          speedRating: 'good',
          comment: 'Thợ Lê Thu Hà làm việc rất chuyên nghiệp, xử lý sự cố nhanh và chu đáo!',
          createdAt: new Date(),
          customer: { id: customerUserId, fullName: 'Trần Quốc Bảo', avatarUrl: null },
          media: [
            { id: 'm1', mediaType: 'image', mediaUrl: 'https://img.jpg', thumbnailUrl: null, createdAt: new Date() },
            { id: 'm2', mediaType: 'video', mediaUrl: 'https://vid.mp4', thumbnailUrl: 'https://thumb.jpg', createdAt: new Date() },
          ],
        },
      ]);
      dbMock.workerReview.count.mockResolvedValue(1);

      // Gọi controller với ID của thợ (từ danh sách đấu giá)
      const result: any = await controller.getWorkerReviews(workerUserId, { page: 1, limit: 10 }, customerUser);

      expect(result.statusCode).toBe(200);
      expect(result.worker.userId).toBe(workerUserId);
      expect(result.worker.fullName).toBe('Lê Thu Hà');
      expect(result.stats.averageRating).toBe(4.95);
      expect(result.stats.ratingCount).toBe(16);
      expect(result.stats.ratingDistribution[5]).toBe(15);
      expect(result.stats.ratingDistribution[4]).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].customer.fullName).toBe('Trần Quốc Bảo');
      expect(result.data[0].media).toHaveLength(2);
      expect(result.data[0].media[0].mediaType).toBe('image');
      expect(result.data[0].media[1].mediaType).toBe('video');
    });

    it('Hoạt động chính xác qua API Alias /reviews/workers/:workerId', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        ratingCount: 1,
        averageRating: 5.0,
        user: { fullName: 'Lê Thu Hà', avatarUrl: null },
      });
      dbMock.workerReview.findMany.mockResolvedValue([]);
      dbMock.workerReview.count.mockResolvedValue(0);

      const result: any = await controller.getWorkerReviewsAlias(workerUserId, {}, customerUser);
      expect(result.statusCode).toBe(200);
      expect(result.worker.fullName).toBe('Lê Thu Hà');
    });
  });

  describe('3. Thợ tự xem tất cả đánh giá của chính mình (Worker self-views reviews)', () => {
    it('Thợ gọi /workers/me/reviews tự động hiển thị mọi đánh giá mà không cần truyền ID', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        ratingCount: 16,
        averageRating: 4.95,
        user: { fullName: 'Lê Thu Hà', avatarUrl: 'https://avatar.png' },
      });

      dbMock.workerReview.groupBy.mockResolvedValue([
        { rating: 5, _count: { rating: 16 } },
      ]);

      dbMock.workerReview.findMany.mockResolvedValue([
        {
          id: 'rev-uuid-001',
          orderId,
          rating: 5,
          attitudeRating: 'good',
          qualityRating: 'good',
          speedRating: 'good',
          comment: 'Rất hài lòng!',
          createdAt: new Date(),
          customer: { id: customerUserId, fullName: 'Trần Quốc Bảo', avatarUrl: null },
          media: [],
        },
      ]);
      dbMock.workerReview.count.mockResolvedValue(1);

      const result: any = await controller.getMyWorkerReviews(workerUser, { page: 1, limit: 10 });

      expect(result.statusCode).toBe(200);
      expect(result.worker.userId).toBe(workerUserId);
      expect(result.data[0].customer.fullName).toBe('Trần Quốc Bảo');
      expect(dbMock.workerProfile.findFirst).toHaveBeenCalledWith({
        where: { userId: workerUserId },
        select: expect.any(Object),
      });
    });
  });

  describe('4. Chi tiết đánh giá & Chữ ký video (Review Detail & Signature)', () => {
    it('Lấy đánh giá theo orderId thành công', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue({
        id: 'rev-uuid-001',
        orderId,
        rating: 5,
        comment: 'Tuyệt vời',
        customer: { id: customerUserId, fullName: 'Trần Quốc Bảo', avatarUrl: null },
        worker: { id: workerUserId, fullName: 'Lê Thu Hà', avatarUrl: null },
        media: [],
      });

      const result: any = await controller.getReviewByOrderId(orderId);
      expect(result.statusCode).toBe(200);
      expect(result.data.orderId).toBe(orderId);
      expect(result.data.customer.fullName).toBe('Trần Quốc Bảo');
    });

    it('Ném NotFoundException 404 khi đơn hàng chưa có đánh giá', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      await expect(controller.getReviewByOrderId(orderId)).rejects.toThrow(NotFoundException);
    });

    it('Khởi tạo chữ ký direct upload video lên Cloudinary thành công', async () => {
      cloudinaryMock.createVideoUploadSignature.mockResolvedValue({
        signature: 'mock-sig-123',
        timestamp: 123456789,
        apiKey: 'mock-key',
        uploadUrl: 'https://cloudinary.com/upload',
      });

      const result: any = await controller.createReviewVideoSignature(customerUser, {
        fileName: 'my-review.mp4',
        mimeType: 'video/mp4',
        fileSize: 10 * 1024 * 1024,
      });

      expect(result.statusCode).toBe(200);
      expect(result.data.signature).toBe('mock-sig-123');
    });
  });
});

