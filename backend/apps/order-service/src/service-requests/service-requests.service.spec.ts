import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '@app/common';
import { RequestStatus } from '@prisma/order-client';
import { ServiceRequestsService } from './service-requests.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import { ORDER_ERROR_CODES } from '../common/constants/order-errors.js';

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let prismaMock: any;
  let outboxRepoMock: any;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockRequestId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    let lastUpdatedData: any = null;

    prismaMock = {
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      serviceRequest: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(async (args) => {
          const current = await prismaMock.serviceRequest.findUnique(args);
          if (lastUpdatedData && current) {
            return { ...current, ...lastUpdatedData };
          }
          return current;
        }),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(async ({ data }: any) => {
          lastUpdatedData = data;
          return { count: 1 };
        }),
      },
      requestMedia: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      bookingProposal: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    outboxRepoMock = {
      createEvent: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    service = new ServiceRequestsService(
      prismaMock as unknown as PrismaService,
      outboxRepoMock as unknown as OrderOutboxRepository,
    );
  });

  describe('createDraft', () => {
    it('should create a draft service request without media', async () => {
      const dto = {
        description: 'Sửa bồn rửa',
        addressText: '123 Đường A',
      };

      const mockCreated = {
        id: mockRequestId,
        requestCode: 'REQ-20261023-A1B2',
        customerUserId: mockUserId,
        status: RequestStatus.draft,
        ...dto,
        media: [],
      };

      prismaMock.serviceRequest.create.mockResolvedValue(mockCreated);

      const result = await service.createDraft(mockUserId, dto);

      expect(prismaMock.serviceRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerUserId: mockUserId,
          status: RequestStatus.draft,
          description: 'Sửa bồn rửa',
          addressText: '123 Đường A',
        }),
        include: { media: true },
      });
      expect(result).toEqual(mockCreated);
    });

    it('should create a draft service request with media attached', async () => {
      const dto = {
        description: 'Sửa bồn rửa',
        media: [
          { mediaUrl: 'https://cdn.example.com/img1.webp', mediaType: 'image' },
        ],
      };

      const mockCreated = {
        id: mockRequestId,
        requestCode: 'REQ-20261023-A1B2',
        customerUserId: mockUserId,
        status: RequestStatus.draft,
        media: [
          {
            id: 'med-1',
            serviceRequestId: mockRequestId,
            mediaUrl: 'https://cdn.example.com/img1.webp',
            mediaType: 'image',
          },
        ],
      };

      prismaMock.serviceRequest.create.mockResolvedValue(mockCreated);

      const result = await service.createDraft(mockUserId, dto);

      expect(prismaMock.serviceRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerUserId: mockUserId,
          status: RequestStatus.draft,
          media: {
            createMany: {
              data: [
                {
                  mediaUrl: 'https://cdn.example.com/img1.webp',
                  mediaType: 'image',
                },
              ],
            },
          },
        }),
        include: { media: true },
      });
      expect(result.media).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('should return paginated list of user requests', async () => {
      prismaMock.serviceRequest.count.mockResolvedValue(1);
      prismaMock.serviceRequest.findMany.mockResolvedValue([
        { id: mockRequestId, customerUserId: mockUserId, media: [] },
      ]);

      const result = await service.findAll(mockUserId, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(prismaMock.serviceRequest.findMany).toHaveBeenCalledWith({
        where: { customerUserId: mockUserId },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { media: true },
      });
    });
  });

  describe('findById', () => {
    it('should return request for customer owner', async () => {
      const mockRequest = {
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.draft,
        media: [],
        bookingProposals: [],
        order: null,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.findById(mockRequestId, mockUserId);
      expect(result).toEqual(mockRequest);
    });

    it('should throw 404 when request does not exist', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.findById(mockRequestId, mockUserId),
      ).rejects.toThrow(AppException);
    });

    it('should throw 403 when another user attempts to view a draft request', async () => {
      const mockRequest = {
        id: mockRequestId,
        customerUserId: 'another-user-id',
        status: RequestStatus.draft,
        media: [],
        bookingProposals: [],
        order: null,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      await expect(
        service.findById(mockRequestId, mockUserId, ['Customer']),
      ).rejects.toThrow(AppException);
    });

    it('should allow admin to view any request', async () => {
      const mockRequest = {
        id: mockRequestId,
        customerUserId: 'another-user-id',
        status: RequestStatus.draft,
        media: [],
        bookingProposals: [],
        order: null,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.findById(mockRequestId, mockUserId, ['Admin']);
      expect(result).toEqual(mockRequest);
    });

    it('should allow worker to view open_for_bidding request', async () => {
      const mockRequest = {
        id: mockRequestId,
        customerUserId: 'another-user-id',
        status: RequestStatus.open_for_bidding,
        media: [],
        bookingProposals: [],
        order: null,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.findById(mockRequestId, mockUserId, ['Worker']);
      expect(result).toEqual(mockRequest);
    });
  });

  describe('updateDraft', () => {
    it('should successfully update a draft request', async () => {
      const existing = {
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.draft,
        media: [],
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(existing);
      prismaMock.serviceRequest.update.mockResolvedValue({
        ...existing,
        description: 'New Description',
      });

      const result = await service.updateDraft(mockRequestId, mockUserId, {
        description: 'New Description',
      });

      expect(result.description).toBe('New Description');
      expect(prismaMock.serviceRequest.updateMany).toHaveBeenCalled();
    });

    it('should throw 409 Conflict if draft was concurrently updated or published', async () => {
      const existing = {
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.draft,
        media: [],
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(existing);
      prismaMock.serviceRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.updateDraft(mockRequestId, mockUserId, { description: 'test' }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('should throw 403 if user is not the owner', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: 'other-user',
        status: RequestStatus.draft,
      });

      await expect(
        service.updateDraft(mockRequestId, mockUserId, { description: 'test' }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if request is not draft', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.open_for_bidding,
      });

      await expect(
        service.updateDraft(mockRequestId, mockUserId, { description: 'test' }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('publish', () => {
    const validScheduledAt = new Date(Date.now() + 2 * 24 * 3600 * 1000); // 2 days in future
    const validDraft = {
      id: mockRequestId,
      requestCode: 'REQ-20261023-A1B2',
      customerUserId: mockUserId,
      serviceId: '33333333-3333-3333-3333-333333333333',
      description: 'Sửa điều hòa rò gas',
      scheduledAt: validScheduledAt,
      addressText: '456 Lê Duẩn, Đà Nẵng',
      latitude: 16.068,
      longitude: 108.212,
      status: RequestStatus.draft,
      media: [],
    };

    it('should publish a valid draft and emit outbox event with 24h & 48h deadlines', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(validDraft);
      prismaMock.serviceRequest.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...validDraft, ...data }),
      );

      const result = await service.publish(mockRequestId, mockUserId);

      expect(result.status).toBe(RequestStatus.open_for_bidding);
      expect(result.publishedAt).toBeDefined();
      expect(result.biddingClosesAt).toBeDefined();
      expect(result.selectionExpiresAt).toBeDefined();

      const biddingClosesTime = new Date(result.biddingClosesAt!).getTime();
      const publishedTime = new Date(result.publishedAt!).getTime();
      const selectionExpiresTime = new Date(result.selectionExpiresAt!).getTime();

      // Check +24h and +48h
      expect(biddingClosesTime - publishedTime).toBeCloseTo(24 * 3600 * 1000, -3);
      expect(selectionExpiresTime - publishedTime).toBeCloseTo(48 * 3600 * 1000, -3);

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
          aggregateId: mockRequestId,
          eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_PUBLISHED,
          payload: expect.objectContaining({
            requestId: mockRequestId,
            addressText: '456 Lê Duẩn, Đà Nẵng',
            latitude: '16.068',
            longitude: '108.212',
          }),
        }),
        expect.anything(),
      );
    });

    it('should throw 422 if latitude is missing when publishing', async () => {
      const draftWithoutLat = {
        ...validDraft,
        latitude: null,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(draftWithoutLat);

      try {
        await service.publish(mockRequestId, mockUserId);
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.getStatus()).toBe(422);
        const resp = err.getResponse();
        expect(resp.code).toBe(ORDER_ERROR_CODES.INCOMPLETE_PUBLISH_PAYLOAD);
        expect(resp.message).toContain('latitude');
      }
    });

    it('should throw 422 if longitude is missing when publishing', async () => {
      const draftWithoutLng = {
        ...validDraft,
        longitude: null,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(draftWithoutLng);

      try {
        await service.publish(mockRequestId, mockUserId);
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppException);
        expect(err.getStatus()).toBe(422);
        const resp = err.getResponse();
        expect(resp.code).toBe(ORDER_ERROR_CODES.INCOMPLETE_PUBLISH_PAYLOAD);
        expect(resp.message).toContain('longitude');
      }
    });

    it('should throw 422 if required fields are missing', async () => {
      const incompleteDraft = {
        ...validDraft,
        serviceId: null,
        addressText: null,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(incompleteDraft);

      await expect(
        service.publish(mockRequestId, mockUserId),
      ).rejects.toThrow(AppException);
    });

    it('should throw 422 if scheduledAt is in the past', async () => {
      const pastDraft = {
        ...validDraft,
        scheduledAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(pastDraft);

      await expect(
        service.publish(mockRequestId, mockUserId),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if request is already open or converted', async () => {
      const publishedDraft = {
        ...validDraft,
        status: RequestStatus.open_for_bidding,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(publishedDraft);

      await expect(
        service.publish(mockRequestId, mockUserId),
      ).rejects.toThrow(AppException);
    });

    it('should throw 409 Conflict if request was concurrently published or converted', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(validDraft);
      prismaMock.serviceRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.publish(mockRequestId, mockUserId),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });
  });

  describe('cancel', () => {
    it('should throw 409 Conflict if request was concurrently converted to order or cancelled', async () => {
      const openRequest = {
        id: mockRequestId,
        requestCode: 'REQ-20261023-A1B2',
        customerUserId: mockUserId,
        status: RequestStatus.open_for_bidding,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(openRequest);
      prismaMock.serviceRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.cancel(mockRequestId, mockUserId),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });
    it('should cancel an open request and withdraw open proposals', async () => {
      const openRequest = {
        id: mockRequestId,
        requestCode: 'REQ-20261023-A1B2',
        customerUserId: mockUserId,
        status: RequestStatus.open_for_bidding,
      };

      prismaMock.serviceRequest.findUnique.mockResolvedValue(openRequest);
      prismaMock.serviceRequest.update.mockResolvedValue({
        ...openRequest,
        status: RequestStatus.cancelled,
      });

      const result = await service.cancel(mockRequestId, mockUserId);

      expect(result.status).toBe(RequestStatus.cancelled);
      expect(prismaMock.bookingProposal.updateMany).toHaveBeenCalledWith({
        where: {
          serviceRequestId: mockRequestId,
          status: 'proposed',
        },
        data: {
          status: 'withdrawn',
        },
      });

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
          aggregateId: mockRequestId,
          eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_CANCELLED,
        }),
        expect.anything(),
      );
    });

    it('should throw 400 if request was converted to order', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.converted_to_order,
      });

      await expect(
        service.cancel(mockRequestId, mockUserId),
      ).rejects.toThrow(AppException);
    });
  });

  describe('addMedia', () => {
    it('should add media to draft service request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.draft,
      });

      const mediaDto = {
        mediaUrl: 'https://cloudinary.com/test.jpg',
        mediaType: 'image',
      };

      const createdMedia = { id: 'media-1', serviceRequestId: mockRequestId, ...mediaDto };
      prismaMock.requestMedia.create.mockResolvedValue(createdMedia);

      const result = await service.addMedia(mockRequestId, mockUserId, mediaDto);

      expect(prismaMock.requestMedia.create).toHaveBeenCalledWith({
        data: {
          serviceRequestId: mockRequestId,
          mediaType: mediaDto.mediaType,
          mediaUrl: mediaDto.mediaUrl,
        },
      });
      expect(result).toEqual(createdMedia);
    });

    it('should throw 400 if request is not in draft status', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.open_for_bidding,
      });

      await expect(
        service.addMedia(mockRequestId, mockUserId, {
          mediaUrl: 'https://cloudinary.com/test.jpg',
          mediaType: 'image',
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('deleteMedia', () => {
    it('should delete media from draft service request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.draft,
      });

      prismaMock.requestMedia.findFirst.mockResolvedValue({
        id: 'media-1',
        serviceRequestId: mockRequestId,
      });

      await service.deleteMedia(mockRequestId, 'media-1', mockUserId);

      expect(prismaMock.requestMedia.delete).toHaveBeenCalledWith({
        where: { id: 'media-1' },
      });
    });

    it('should throw 404 if media is not found', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockUserId,
        status: RequestStatus.draft,
      });

      prismaMock.requestMedia.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteMedia(mockRequestId, 'media-999', mockUserId),
      ).rejects.toThrow(AppException);
    });
  });

  describe('findById (BE-12)', () => {
    const mockWorkerA = 'worker-uuid-a';
    const mockWorkerB = 'worker-uuid-b';
    const mockRequestWithProposals = {
      id: mockRequestId,
      customerUserId: mockUserId,
      status: RequestStatus.open_for_bidding,
      media: [],
      bookingProposals: [
        { id: 'prop-a', workerUserId: mockWorkerA, agreedPrice: 200000 },
        { id: 'prop-b', workerUserId: mockWorkerB, agreedPrice: 350000 },
      ],
      order: null,
    };

    it('customer owner can see all nested booking proposals', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequestWithProposals);

      const result = await service.findById(mockRequestId, mockUserId, ['Customer']);

      expect(result.bookingProposals).toHaveLength(2);
      expect(result.bookingProposals).toEqual(mockRequestWithProposals.bookingProposals);
    });

    it('Admin can see all nested booking proposals', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequestWithProposals);

      const result = await service.findById(mockRequestId, 'admin-id', ['Admin']);

      expect(result.bookingProposals).toHaveLength(2);
    });

    it('non-owner Customer (without Worker role) receives 403 Forbidden', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequestWithProposals);

      await expect(
        service.findById(mockRequestId, 'other-customer', ['Customer']),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('Worker A only sees their own nested proposal and cannot see Worker B proposal', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequestWithProposals);

      const result = await service.findById(mockRequestId, mockWorkerA, ['Worker']);

      expect(result.bookingProposals).toHaveLength(1);
      expect(result.bookingProposals[0].workerUserId).toBe(mockWorkerA);
      expect(result.bookingProposals[0].id).toBe('prop-a');
    });

    it('Worker without any proposal sees empty proposals list [] and not other proposals', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequestWithProposals);

      const result = await service.findById(mockRequestId, 'worker-c', ['Worker']);

      expect(result.bookingProposals).toHaveLength(0);
    });
  });
});
