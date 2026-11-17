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
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn(),
        groupBy: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _avg: { rating: 5.0 }, _count: { rating: 10 } }),
      },
      reviewMedia: {
        deleteMany: vi.fn(),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
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

    it('Chặn đánh giá nếu đơn hàng đã hoàn thành quá 14 ngày (Review window limit)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'completed',
        completedAt: fifteenDaysAgo,
        customerUserId,
        workerUserId,
      });

      await expect(
        service.createReview(customerUserId, { orderId, rating: 5 }),
      ).rejects.toThrow('Đã quá thời hạn đánh giá đơn hàng (tối đa 14 ngày kể từ khi hoàn thành)');
    });

    it('Chặn đánh giá nếu đơn hàng đang trong trạng thái khiếu nại hoặc tranh chấp (status = disputed)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'disputed',
        customerUserId,
        workerUserId,
      });

      await expect(
        service.createReview(customerUserId, { orderId, rating: 5 }),
      ).rejects.toThrow('Không thể đánh giá đơn hàng đang trong trạng thái khiếu nại hoặc tranh chấp');
    });

    it('Chặn đánh giá nếu đơn hàng đã bị hủy (status = cancelled)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'cancelled',
        customerUserId,
        workerUserId,
      });

      await expect(
        service.createReview(customerUserId, { orderId, rating: 5 }),
      ).rejects.toThrow('Không thể đánh giá đơn hàng đã bị hủy');
    });

    it('Chặn đánh giá nếu đơn hàng đã hoàn tiền (paymentState = refunded)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'completed',
        paymentState: 'refunded',
        customerUserId,
        workerUserId,
      });

      await expect(
        service.createReview(customerUserId, { orderId, rating: 5 }),
      ).rejects.toThrow('Không thể đánh giá đơn hàng đã được hoàn tiền');
    });

    it('Chặn đính kèm quá 6 media, quá 5 ảnh hoặc quá 1 video', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'completed',
        customerUserId,
        workerUserId,
      });
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
      });

      // 6 ảnh + 1 video = 7 media items (> 6)
      const tooManyMediaDto = {
        orderId,
        rating: 5,
        media: [
          { mediaType: 'image' as const, mediaUrl: 'https://img1.jpg' },
          { mediaType: 'image' as const, mediaUrl: 'https://img2.jpg' },
          { mediaType: 'image' as const, mediaUrl: 'https://img3.jpg' },
          { mediaType: 'image' as const, mediaUrl: 'https://img4.jpg' },
          { mediaType: 'image' as const, mediaUrl: 'https://img5.jpg' },
          { mediaType: 'image' as const, mediaUrl: 'https://img6.jpg' },
          { mediaType: 'video' as const, mediaUrl: 'https://vid1.mp4' },
        ],
      };
      await expect(
        service.createReview(customerUserId, tooManyMediaDto),
      ).rejects.toThrow('Chỉ được đính kèm tối đa 6 hình ảnh hoặc video');

      // 2 videos (> 1 video)
      const twoVideosDto = {
        orderId,
        rating: 5,
        media: [
          { mediaType: 'video' as const, mediaUrl: 'https://vid1.mp4' },
          { mediaType: 'video' as const, mediaUrl: 'https://vid2.mp4' },
        ],
      };
      await expect(
        service.createReview(customerUserId, twoVideosDto),
      ).rejects.toThrow('Chỉ được đính kèm tối đa 1 video');
    });

    it('Chặn upload video trực tiếp qua multipart form data và yêu cầu dùng signature (P1-01)', async () => {
      dbMock.workerReview.findUnique.mockResolvedValue(null);
      orderClientMock.getOrder.mockResolvedValue({
        orderId,
        status: 'completed',
        customerUserId,
        workerUserId,
      });
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
      });

      const fakeVideoFile = {
        fieldname: 'videos',
        originalname: 'demo.mp4',
        mimetype: 'video/mp4',
        buffer: Buffer.from('fake-video-content'),
        size: 1024,
      } as Express.Multer.File;

      await expect(
        service.createReview(
          customerUserId,
          { orderId, rating: 5, comment: 'Test video' },
          undefined,
          { videos: [fakeVideoFile] },
        ),
      ).rejects.toThrow('Video đánh giá không hỗ trợ tải trực tiếp qua multipart');
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

    it('Lọc đánh giá chỉ có hình ảnh/video thực tế (hasMedia=true)', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        ratingCount: 16,
        averageRating: 4.95,
        user: { fullName: 'Lê Thu Hà', avatarUrl: null },
      });
      dbMock.workerReview.groupBy.mockResolvedValue([]);
      dbMock.workerReview.findMany.mockResolvedValue([]);
      dbMock.workerReview.count.mockResolvedValue(0);

      await controller.getWorkerReviews(workerUserId, { hasMedia: true }, customerUser);

      expect(dbMock.workerReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workerUserId,
            status: 'published',
            media: { some: {} },
          }),
        }),
      );
    });

    it('Sắp xếp đánh giá theo sao cao nhất (sortBy=highest_rating)', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        ratingCount: 16,
        averageRating: 4.95,
        user: { fullName: 'Lê Thu Hà', avatarUrl: null },
      });
      dbMock.workerReview.groupBy.mockResolvedValue([]);
      dbMock.workerReview.findMany.mockResolvedValue([]);
      dbMock.workerReview.count.mockResolvedValue(0);

      await controller.getWorkerReviews(workerUserId, { sortBy: 'highest_rating' }, customerUser);

      expect(dbMock.workerReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });

    it('Sắp xếp đánh giá theo sao thấp nhất (sortBy=lowest_rating)', async () => {
      dbMock.workerProfile.findFirst.mockResolvedValue({
        id: workerProfileId,
        userId: workerUserId,
        ratingCount: 16,
        averageRating: 4.95,
        user: { fullName: 'Lê Thu Hà', avatarUrl: null },
      });
      dbMock.workerReview.groupBy.mockResolvedValue([]);
      dbMock.workerReview.findMany.mockResolvedValue([]);
      dbMock.workerReview.count.mockResolvedValue(0);

      await controller.getWorkerReviews(workerUserId, { sortBy: 'lowest_rating' }, customerUser);

      expect(dbMock.workerReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ rating: 'asc' }, { createdAt: 'desc' }],
        }),
      );
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

  describe('5. Khách hàng chỉnh sửa đánh giá (Customer edits review)', () => {
    const reviewId = 'a1111111-2222-4333-8444-555555555555';
    const existingReview = {
      id: reviewId,
      orderId,
      customerUserId,
      workerUserId,
      rating: 5,
      attitudeRating: 'good',
      qualityRating: 'good',
      speedRating: 'good',
      comment: 'Ban đầu thấy rất tốt!',
      status: 'published',
      isEdited: false,
      editedAt: null,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // Tạo 2 giờ trước (trong 48h)
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      media: [
        {
          id: 'med-img-1',
          mediaType: 'image',
          mediaUrl: 'https://img.jpg',
          thumbnailUrl: null,
          createdAt: new Date(),
        },
      ],
      customer: { id: customerUserId, fullName: 'Trần Quốc Bảo', avatarUrl: null },
      worker: { id: workerUserId, fullName: 'Lê Thu Hà', avatarUrl: null },
    };

    it('Chỉnh sửa đánh giá thành công trong vòng 48h (cập nhật rating 5 -> 4, recalculate rating, set isEdited)', async () => {
      dbMock.workerReview.findFirst.mockResolvedValue(existingReview);
      dbMock.workerReview.updateMany.mockResolvedValue({ count: 1 });
      dbMock.workerReview.findUnique.mockResolvedValue({
        ...existingReview,
        rating: 4,
        comment: 'Đã sửa nhận xét: Dùng thử vài giờ thấy có chút vấn đề nhỏ nhưng thợ vẫn nhiệt tình.',
        isEdited: true,
        editedAt: new Date(),
      });
      dbMock.workerReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.88 },
        _count: { rating: 16 },
      });

      const updateDto = {
        rating: 4,
        comment: 'Đã sửa nhận xét: Dùng thử vài giờ thấy có chút vấn đề nhỏ nhưng thợ vẫn nhiệt tình.',
      };

      const result: any = await controller.updateReview(customerUser, reviewId, updateDto);

      expect(result.statusCode).toBe(200);
      expect(result.data.rating).toBe(4);
      expect(result.data.isEdited).toBe(true);
      expect(result.data.editedAt).toBeDefined();
      expect(dbMock.workerReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: reviewId, isEdited: false },
          data: expect.objectContaining({
            rating: 4,
            isEdited: true,
          }),
        }),
      );
      expect(dbMock.workerProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: workerUserId },
        data: expect.objectContaining({ ratingCount: 16 }),
      });
      expect(dbMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'review.updated',
            payload: expect.objectContaining({
              oldRating: 5,
              newRating: 4,
            }),
          }),
        }),
      );
    });

    it('Hoạt động thành công qua PATCH endpoint theo orderId (PATCH /orders/:orderId/reviews)', async () => {
      dbMock.workerReview.findFirst.mockResolvedValue(existingReview);
      dbMock.workerReview.updateMany.mockResolvedValue({ count: 1 });
      dbMock.workerReview.findUnique.mockResolvedValue({
        ...existingReview,
        comment: 'Sửa nhận xét qua orderId',
        isEdited: true,
        editedAt: new Date(),
      });

      const result: any = await controller.patchOrderReview(customerUser, orderId, {
        comment: 'Sửa nhận xét qua orderId',
      });

      expect(result.statusCode).toBe(200);
      expect(result.data.isEdited).toBe(true);
    });

    it('Chặn race condition khi 2 request chỉnh sửa review gửi đồng thời (chính xác 1 request thành công) (P1-02)', async () => {
      dbMock.workerReview.findFirst.mockResolvedValue(existingReview);

      let updateCallCount = 0;
      dbMock.workerReview.updateMany.mockImplementation(async () => {
        updateCallCount++;
        if (updateCallCount === 1) {
          return { count: 1 };
        }
        return { count: 0 };
      });

      dbMock.workerReview.findUnique.mockResolvedValue({
        ...existingReview,
        rating: 4,
        isEdited: true,
        editedAt: new Date(),
      });

      const req1 = service.updateReview(customerUserId, reviewId, { rating: 4, comment: 'Edit 1' });
      const req2 = service.updateReview(customerUserId, reviewId, { rating: 3, comment: 'Edit 2' });

      const results = await Promise.allSettled([req1, req2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError).toBeInstanceOf(BadRequestException);
      expect(rejectedError.message).toBe('Đánh giá chỉ được phép chỉnh sửa 1 lần duy nhất');

      expect(dbMock.outboxEvent.create).toHaveBeenCalledTimes(1);
    });

    it('Chặn chỉnh sửa nếu người gọi không phải khách hàng đã tạo đánh giá (ForbiddenException 403)', async () => {
      dbMock.workerReview.findFirst.mockResolvedValue(existingReview);

      await expect(
        service.updateReview('a0000000-0000-4000-8000-000000000099', reviewId, { rating: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Chặn chỉnh sửa lần 2 nếu đánh giá đã từng được chỉnh sửa (isEdited = true)', async () => {
      dbMock.workerReview.findFirst.mockResolvedValue({
        ...existingReview,
        isEdited: true,
        editedAt: new Date(),
      });

      await expect(
        service.updateReview(customerUserId, reviewId, { rating: 3 }),
      ).rejects.toThrow('Đánh giá chỉ được phép chỉnh sửa 1 lần duy nhất');
    });

    it('Chặn chỉnh sửa nếu đã quá 48 giờ kể từ khi tạo', async () => {
      const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000);
      dbMock.workerReview.findFirst.mockResolvedValue({
        ...existingReview,
        createdAt: fiftyHoursAgo,
      });

      await expect(
        service.updateReview(customerUserId, reviewId, { rating: 4 }),
      ).rejects.toThrow('Đã quá thời hạn chỉnh sửa đánh giá (tối đa 48 giờ kể từ khi tạo)');
    });

    it('Chặn upload video trực tiếp qua multipart khi chỉnh sửa đánh giá (P1-01)', async () => {
      dbMock.workerReview.findFirst.mockResolvedValue(existingReview);

      const fakeVideoFile = {
        fieldname: 'videos',
        originalname: 'update.mp4',
        mimetype: 'video/mp4',
        buffer: Buffer.from('fake-video-content'),
        size: 1024,
      } as Express.Multer.File;

      await expect(
        service.updateReview(
          customerUserId,
          reviewId,
          { rating: 4 },
          { videos: [fakeVideoFile] },
        ),
      ).rejects.toThrow('Video đánh giá không hỗ trợ tải trực tiếp qua multipart');
    });
  });
});

