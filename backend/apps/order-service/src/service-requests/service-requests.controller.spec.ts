import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { ServiceRequestsController } from './service-requests.controller.js';
import type { ServiceRequestsService } from './service-requests.service.js';

describe('ServiceRequestsController', () => {
  let controller: ServiceRequestsController;
  let serviceMock: {
    createDraft: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    updateDraft: ReturnType<typeof vi.fn>;
    addMedia: ReturnType<typeof vi.fn>;
    deleteMedia: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let bookingProposalsServiceMock: {
    findByServiceRequestId: ReturnType<typeof vi.fn>;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockRequestId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    serviceMock = {
      createDraft: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      updateDraft: vi.fn(),
      addMedia: vi.fn(),
      deleteMedia: vi.fn(),
      publish: vi.fn(),
      cancel: vi.fn(),
    };

    bookingProposalsServiceMock = {
      findByServiceRequestId: vi.fn(),
    };

    controller = new ServiceRequestsController(
      serviceMock as unknown as ServiceRequestsService,
      bookingProposalsServiceMock as any,
    );
  });

  describe('create', () => {
    it('should create draft and return 201 wrapped response', async () => {
      const dto = { description: 'Sửa điện' };
      const created = { id: mockRequestId, ...dto };
      serviceMock.createDraft.mockResolvedValue(created);

      const response = await controller.create(mockUserId, dto);

      expect(serviceMock.createDraft).toHaveBeenCalledWith(mockUserId, dto);
      expect(response.statusCode).toBe(HttpStatus.CREATED);
      expect(response.data).toEqual(created);
    });
  });

  describe('findAll', () => {
    it('should return list of requests with pagination', async () => {
      const query = { page: 1, limit: 10 };
      const result = { items: [], total: 0, page: 1, limit: 10, totalPages: 1 };
      serviceMock.findAll.mockResolvedValue(result);

      const response = await controller.findAll(mockUserId, query);

      expect(serviceMock.findAll).toHaveBeenCalledWith(mockUserId, query);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(result);
    });
  });

  describe('findOne', () => {
    it('should return details of single request', async () => {
      const user = {
        userId: mockUserId,
        roles: ['Customer'],
        permissions: [],
      };
      const detail = { id: mockRequestId, description: 'Test' };
      serviceMock.findById.mockResolvedValue(detail);

      const response = await controller.findOne(mockRequestId, user);

      expect(serviceMock.findById).toHaveBeenCalledWith(
        mockRequestId,
        mockUserId,
        ['Customer'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(detail);
    });
  });

  describe('update', () => {
    it('should update draft and return wrapped response', async () => {
      const dto = { description: 'Updated' };
      const updated = { id: mockRequestId, description: 'Updated' };
      serviceMock.updateDraft.mockResolvedValue(updated);

      const response = await controller.update(mockRequestId, mockUserId, dto);

      expect(serviceMock.updateDraft).toHaveBeenCalledWith(
        mockRequestId,
        mockUserId,
        dto,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(updated);
    });
  });

  describe('addMedia', () => {
    it('should add media and return 201 wrapped response', async () => {
      const dto = {
        mediaUrl: 'https://cloudinary.com/test.jpg',
        mediaType: 'image',
      };
      const createdMedia = { id: 'media-1', ...dto };
      serviceMock.addMedia.mockResolvedValue(createdMedia);

      const response = await controller.addMedia(mockRequestId, mockUserId, dto);

      expect(serviceMock.addMedia).toHaveBeenCalledWith(
        mockRequestId,
        mockUserId,
        dto,
      );
      expect(response.statusCode).toBe(HttpStatus.CREATED);
      expect(response.data).toEqual(createdMedia);
    });
  });

  describe('deleteMedia', () => {
    it('should delete media and return 200 wrapped response', async () => {
      serviceMock.deleteMedia.mockResolvedValue(undefined);

      const response = await controller.deleteMedia(
        mockRequestId,
        'media-1',
        mockUserId,
      );

      expect(serviceMock.deleteMedia).toHaveBeenCalledWith(
        mockRequestId,
        'media-1',
        mockUserId,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toBeNull();
    });
  });

  describe('publish', () => {
    it('should publish request and return wrapped response', async () => {
      const published = { id: mockRequestId, status: 'open_for_bidding' };
      serviceMock.publish.mockResolvedValue(published);

      const response = await controller.publish(mockRequestId, mockUserId);

      expect(serviceMock.publish).toHaveBeenCalledWith(mockRequestId, mockUserId);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(published);
    });
  });

  describe('cancel', () => {
    it('should cancel request and return wrapped response', async () => {
      const cancelled = { id: mockRequestId, status: 'cancelled' };
      serviceMock.cancel.mockResolvedValue(cancelled);

      const response = await controller.cancel(mockRequestId, mockUserId);

      expect(serviceMock.cancel).toHaveBeenCalledWith(mockRequestId, mockUserId);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(cancelled);
    });
  });

  describe('findProposals', () => {
    it('should return proposals for service request', async () => {
      const proposals = [{ id: 'prop-1' }];
      bookingProposalsServiceMock.findByServiceRequestId.mockResolvedValue(proposals);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };
      const response = await controller.findProposals(mockRequestId, user);

      expect(bookingProposalsServiceMock.findByServiceRequestId).toHaveBeenCalledWith(
        mockRequestId,
        mockUserId,
        ['Customer'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(proposals);
    });
  });
});
