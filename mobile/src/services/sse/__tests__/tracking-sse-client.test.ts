import {
  TrackingSseClient,
} from '../tracking-sse-client';
import {
  computeMilestonesFromSummary,
  type TrackingEventItem,
} from '@/features/tracking/types/tracking.types';

// Mock auth & API client
const mockGetToken = jest.fn(() => ({ access: 'mock-access-token', refresh: 'mock-refresh-token' }));
jest.mock('@/lib/auth/utils', () => ({
  getToken: () => mockGetToken(),
}));

const mockRefreshTokens = jest.fn().mockResolvedValue('mock-new-access-token');
jest.mock('@/services/api/api-client', () => ({
  resolveApiBaseUrl: jest.fn(() => 'http://127.0.0.1:3000/api/v1'),
  refreshTokens: () => mockRefreshTokens(),
  request: jest.fn(),
}));

jest.mock('@/services/logger/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TrackingSseClient & Tracking Module Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetToken.mockReturnValue({ access: 'mock-access-token', refresh: 'mock-refresh-token' });
    mockRefreshTokens.mockResolvedValue('mock-new-access-token');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('TrackingSseClient Fetch Transport (Web)', () => {
    it('should connect, stream timeline events via fetch and dispatch to listeners', async () => {
      const serviceRequestId = '11111111-2222-3333-4444-555555555555';
      const client = new TrackingSseClient(serviceRequestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        heartbeatTimeoutMs: 10000,
        transport: 'fetch',
      });

      const onEventListener = jest.fn();
      const statusListener = jest.fn();
      const openListener = jest.fn();
      const connectedListener = jest.fn();
      const pingListener = jest.fn();

      client.onEvent(onEventListener);
      client.onStatusChange(statusListener);
      client.on('open', openListener);
      client.on('connected', connectedListener);
      client.on('ping', pingListener);

      const mockEventItem: TrackingEventItem = {
        id: 'evt-1',
        eventId: 'orig-1',
        entityType: 'order',
        entityId: 'ord-123',
        eventType: 'order.started',
        sourceService: 'order-service',
        fromStatus: 'confirmed',
        toStatus: 'in_progress',
        occurredAt: '2026-11-06T10:00:00.000Z',
        recordedAt: '2026-11-06T10:00:01.000Z',
      };

      const chunks = [
        new TextEncoder().encode(
          'event: connected\ndata: {"type":"connected","serviceRequestId":"11111111-2222-3333-4444-555555555555","message":"Connected"}\n\n',
        ),
        new TextEncoder().encode('event: ping\ndata: {"type":"ping","timestamp":"2026-11-06T10:00:00Z"}\n\n'),
        new TextEncoder().encode(
          `id: evt-1\nevent: timeline_event\ndata: {"type":"timeline_event","payload":${JSON.stringify(mockEventItem)}}\n\n`,
        ),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      } as any);

      await client.connect();

      expect(statusListener).toHaveBeenCalledWith('reconnecting');
      expect(statusListener).toHaveBeenCalledWith('connected');
      expect(openListener).toHaveBeenCalled();
      expect(connectedListener).toHaveBeenCalledWith({
        type: 'connected',
        serviceRequestId,
        message: 'Connected',
      });
      expect(pingListener).toHaveBeenCalledWith({
        type: 'ping',
        timestamp: '2026-11-06T10:00:00Z',
      });
      expect(onEventListener).toHaveBeenCalledWith(mockEventItem);
      expect(client.getLastEventId()).toBe('evt-1');

      client.disconnect();
      expect(client.getStatus()).toBe('disconnected');
      expect(client.getIsOpen()).toBe(false);
    });

    it('should include Last-Event-ID header and lastEventId query parameter upon reconnection', async () => {
      const serviceRequestId = 'req-last-event-id';
      const client = new TrackingSseClient(serviceRequestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        lastEventId: 'prev-event-id-999',
        transport: 'fetch',
      });

      const mockReader = {
        read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      } as any);
      global.fetch = fetchMock;

      await client.connect();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = fetchMock.mock.calls[0][0];
      const callInit = fetchMock.mock.calls[0][1];

      expect(callUrl).toContain('lastEventId=prev-event-id-999');
      expect(callInit.headers['Last-Event-ID']).toBe('prev-event-id-999');

      client.disconnect();
    });

    it('should handle 401 Unauthorized by refreshing tokens and reconnecting', async () => {
      const serviceRequestId = 'req-401-refresh';
      const client = new TrackingSseClient(serviceRequestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        transport: 'fetch',
      });

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: () => Promise.resolve({ done: true, value: undefined }),
            }),
          },
        });
      });

      await client.connect();

      expect(mockRefreshTokens).toHaveBeenCalled();
      client.disconnect();
    });
  });

  describe('TrackingSseClient XMLHttpRequest Transport (React Native)', () => {
    let mockXhrInstances: any[] = [];

    beforeEach(() => {
      mockXhrInstances = [];
      (global as any).XMLHttpRequest = jest.fn().mockImplementation(() => {
        const instance: any = {
          open: jest.fn(),
          setRequestHeader: jest.fn(),
          send: jest.fn(),
          abort: jest.fn(),
          readyState: 0,
          status: 0,
          responseText: '',
          onreadystatechange: null,
          onprogress: null,
          onload: null,
          onerror: null,
        };
        mockXhrInstances.push(instance);
        return instance;
      });
    });

    it('should connect via XHR, stream chunks progressively and parse timeline events', async () => {
      const serviceRequestId = 'req-xhr-test';
      const client = new TrackingSseClient(serviceRequestId, {
        transport: 'xhr',
      });

      const onEvent = jest.fn();
      client.onEvent(onEvent);

      await client.connect();

      expect(mockXhrInstances.length).toBe(1);
      const xhr = mockXhrInstances[0];

      // Simulate headers received 200 OK
      xhr.readyState = 2;
      xhr.status = 200;
      xhr.onreadystatechange();

      expect(client.getStatus()).toBe('connected');
      expect(client.getIsOpen()).toBe(true);

      // Simulate progress chunk with connected and timeline_event
      const eventData = {
        type: 'timeline_event',
        payload: {
          id: 'evt-xhr-1',
          eventType: 'order.rework_requested',
          occurredAt: '2026-11-06T11:00:00Z',
          recordedAt: '2026-11-06T11:00:01Z',
        },
      };

      xhr.responseText = `id: evt-xhr-1\nevent: timeline_event\ndata: ${JSON.stringify(eventData)}\n\n`;
      xhr.onprogress();

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt-xhr-1',
          eventType: 'order.rework_requested',
        }),
      );
      expect(client.getLastEventId()).toBe('evt-xhr-1');

      client.disconnect();
      expect(xhr.abort).toHaveBeenCalled();
      expect(client.getStatus()).toBe('disconnected');
      expect(client.getIsOpen()).toBe(false);
    });

    it('should trigger reconnect when heartbeat watchdog times out', async () => {
      const serviceRequestId = 'req-watchdog-xhr';
      const client = new TrackingSseClient(serviceRequestId, {
        heartbeatTimeoutMs: 5000,
        transport: 'xhr',
      });

      const statusListener = jest.fn();
      client.onStatusChange(statusListener);

      await client.connect();
      const xhr = mockXhrInstances[0];

      xhr.readyState = 2;
      xhr.status = 200;
      xhr.onreadystatechange();

      expect(client.getStatus()).toBe('connected');

      // Fast forward past heartbeat timeout
      jest.advanceTimersByTime(5100);

      expect(xhr.abort).toHaveBeenCalled();
      expect(client.getStatus()).toBe('reconnecting');

      client.disconnect();
      expect(client.getStatus()).toBe('disconnected');
    });

    it('should handle XHR 401 by calling refreshTokens and rescheduling reconnect', async () => {
      const serviceRequestId = 'req-xhr-401';
      const client = new TrackingSseClient(serviceRequestId, {
        transport: 'xhr',
      });

      await client.connect();

      expect(mockXhrInstances.length).toBe(1);
      const xhr = mockXhrInstances[0];

      xhr.readyState = 2;
      xhr.status = 401;
      xhr.onreadystatechange();

      expect(mockRefreshTokens).toHaveBeenCalled();

      client.disconnect();
    });

    it('should clean up listeners, timers and active connection on disconnect', async () => {
      const serviceRequestId = 'req-clean';
      const client = new TrackingSseClient(serviceRequestId, {
        transport: 'xhr',
      });

      const statusListener = jest.fn();
      client.onStatusChange(statusListener);

      await client.connect();
      expect(client.getStatus()).toBe('reconnecting');

      client.disconnect();
      expect(client.getStatus()).toBe('disconnected');
      expect(client.getIsOpen()).toBe(false);
    });
  });

  describe('computeMilestonesFromSummary helper', () => {
    it('should return existing milestones array if already provided', () => {
      const existingMilestones = [
        {
          key: 'custom',
          title: 'Custom Title',
          description: 'Custom Desc',
          status: 'completed' as const,
          reachedAt: '2026-11-06T00:00:00Z',
        },
      ];

      const result = computeMilestonesFromSummary({
        currentPhase: 'COMPLETED',
        milestones: existingMilestones,
      });

      expect(result).toBe(existingMilestones);
    });

    it('should compute full set of 5 standard milestones from summary sub-objects', () => {
      const summary = {
        serviceRequestId: 'req-1',
        currentPhase: 'ORDER_IN_PROGRESS',
        serviceRequest: {
          status: 'converted_to_order',
          createdAt: '2026-11-06T08:00:00Z',
          publishedAt: '2026-11-06T08:05:00Z',
        },
        bidding: {
          status: 'finalized',
          bidCount: 3,
          finalizedAt: '2026-11-06T08:30:00Z',
        },
        bookingProposal: {
          proposalId: 'prop-1',
          status: 'finalized',
          finalizedAt: '2026-11-06T08:45:00Z',
        },
        order: {
          orderId: 'ord-1',
          status: 'in_progress',
          createdAt: '2026-11-06T08:50:00Z',
        },
      };

      const milestones = computeMilestonesFromSummary(summary as any);

      expect(milestones).toHaveLength(5);

      // 1. service_request: completed
      expect(milestones[0].key).toBe('service_request');
      expect(milestones[0].status).toBe('completed');

      // 2. bidding: completed
      expect(milestones[1].key).toBe('bidding');
      expect(milestones[1].status).toBe('completed');

      // 3. booking_proposal: completed
      expect(milestones[2].key).toBe('booking_proposal');
      expect(milestones[2].status).toBe('completed');

      // 4. order_execution: in_progress
      expect(milestones[3].key).toBe('order_execution');
      expect(milestones[3].status).toBe('in_progress');

      // 5. payment_completion: pending
      expect(milestones[4].key).toBe('payment_completion');
      expect(milestones[4].status).toBe('pending');
    });

    it('should reflect skipped status when request was cancelled', () => {
      const summary = {
        serviceRequestId: 'req-cancelled',
        currentPhase: 'CANCELLED',
        serviceRequest: {
          status: 'cancelled',
          createdAt: '2026-11-06T08:00:00Z',
          cancelledAt: '2026-11-06T08:10:00Z',
        },
      };

      const milestones = computeMilestonesFromSummary(summary as any);
      expect(milestones[0].status).toBe('skipped');
    });
  });
});
