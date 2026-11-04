import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { of } from 'rxjs';
import { TimelineController } from './timeline.controller.js';
import type { TimelineService } from './timeline.service.js';
import type { TimelineStreamService } from '../common/stream/timeline-stream.service.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';
import type { TimelineQueryDto } from './dto/timeline-query.dto.js';

describe('TimelineController', () => {
  let controller: TimelineController;
  let timelineServiceMock: any;
  let streamServiceMock: any;

  beforeEach(() => {
    timelineServiceMock = {
      getRequestTimeline: vi.fn(),
      getBidTimeline: vi.fn(),
      getOrderTimeline: vi.fn(),
    };

    streamServiceMock = {
      getLiveStream: vi.fn(),
      broadcastEvent: vi.fn(),
    };

    controller = new TimelineController(
      timelineServiceMock as unknown as TimelineService,
      streamServiceMock as unknown as TimelineStreamService,
    );
  });


  describe('getRequestTimeline', () => {
    it('should return wrapped success response with timeline data', async () => {
      const serviceRequestId = randomUUID();
      const query: TimelineQueryDto = { page: 1, limit: 10 };
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const mockData = {
        items: [
          {
            id: randomUUID(),
            eventId: randomUUID(),
            entityType: 'service_request',
            entityId: serviceRequestId,
            eventType: 'service_request.created',
            sourceService: 'order-service',
            occurredAt: new Date(),
            recordedAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      timelineServiceMock.getRequestTimeline.mockResolvedValue(mockData);

      const response = await controller.getRequestTimeline(
        serviceRequestId,
        query,
        user,
      );

      expect(timelineServiceMock.getRequestTimeline).toHaveBeenCalledWith(
        serviceRequestId,
        query,
        user,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Lấy lịch sử tiến trình yêu cầu thành công');
      expect(response.data).toEqual(mockData);
    });
  });

  describe('getBidTimeline', () => {
    it('should return wrapped success response for bid timeline', async () => {
      const bidId = randomUUID();
      const query: TimelineQueryDto = { page: 1, limit: 10 };
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      const mockData = {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      timelineServiceMock.getBidTimeline.mockResolvedValue(mockData);

      const response = await controller.getBidTimeline(bidId, query, user);

      expect(timelineServiceMock.getBidTimeline).toHaveBeenCalledWith(
        bidId,
        query,
        user,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Lấy lịch sử báo giá thành công');
    });
  });

  describe('getOrderTimeline', () => {
    it('should return wrapped success response for order timeline', async () => {
      const orderId = randomUUID();
      const query: TimelineQueryDto = { page: 1, limit: 10 };
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const mockData = {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      timelineServiceMock.getOrderTimeline.mockResolvedValue(mockData);

      const response = await controller.getOrderTimeline(orderId, query, user);

      expect(timelineServiceMock.getOrderTimeline).toHaveBeenCalledWith(
        orderId,
        query,
        user,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Lấy lịch sử đơn hàng thành công');
    });
  });

  describe('streamLiveTimeline', () => {
    it('should delegate to timelineStreamService.getLiveStream', async () => {
      const serviceRequestId = randomUUID();
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const mockObservable = of({ data: { type: 'connected' } });
      streamServiceMock.getLiveStream.mockResolvedValue(mockObservable);

      const result = await controller.streamLiveTimeline(serviceRequestId, user);

      expect(streamServiceMock.getLiveStream).toHaveBeenCalledWith(
        serviceRequestId,
        user,
        undefined,
      );
      expect(result).toBe(mockObservable);
    });

    it('should forward last-event-id header to timelineStreamService on reconnect', async () => {
      const serviceRequestId = randomUUID();
      const lastEventId = randomUUID();
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const mockObservable = of({ data: { type: 'connected' } });
      streamServiceMock.getLiveStream.mockResolvedValue(mockObservable);

      await controller.streamLiveTimeline(
        serviceRequestId,
        user,
        lastEventId,
      );

      expect(streamServiceMock.getLiveStream).toHaveBeenCalledWith(
        serviceRequestId,
        user,
        lastEventId,
      );
    });
  });
});

