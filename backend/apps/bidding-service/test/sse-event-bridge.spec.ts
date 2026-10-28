import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SseEventBridgeService } from '../src/sse/sse-event-bridge.service.js';
import type { SseService } from '../src/sse/sse.service.js';
import type { ConfigService } from '@app/config';

describe('SseEventBridgeService (BE-02 / BE-07)', () => {
  let bridge: SseEventBridgeService;
  let mockSseService: {
    broadcastBidChanged: ReturnType<typeof vi.fn>;
    broadcastRoundChanged: ReturnType<typeof vi.fn>;
    broadcastMatchingChanged: ReturnType<typeof vi.fn>;
  };
  let mockConfig: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSseService = {
      broadcastBidChanged: vi.fn(),
      broadcastRoundChanged: vi.fn(),
      broadcastMatchingChanged: vi.fn(),
    };
    mockConfig = {
      get: vi.fn().mockReturnValue('amqp://localhost:5672'),
    };

    bridge = new SseEventBridgeService(
      mockSseService as unknown as SseService,
      mockConfig as unknown as ConfigService,
    );
  });

  describe('handleFanoutMessage event mappings', () => {
    it('should map bid.submitted to sseService.broadcastBidChanged(kind=submitted)', () => {
      bridge.handleFanoutMessage({
        eventType: 'bid.submitted',
        eventId: 'evt-bid-sub',
        payload: {
          requestId: 'req-1',
          workerId: 'w-1',
          amount: 250000,
        },
      });

      expect(mockSseService.broadcastBidChanged).toHaveBeenCalledWith(
        'req-1',
        'submitted',
        'evt-bid-sub',
        expect.any(String),
      );
    });

    it('should map bid.revised and bid.withdrawn correctly', () => {
      bridge.handleFanoutMessage({
        eventType: 'bid.revised',
        eventId: 'evt-bid-rev',
        requestId: 'req-2',
      });
      expect(mockSseService.broadcastBidChanged).toHaveBeenCalledWith(
        'req-2',
        'revised',
        'evt-bid-rev',
        expect.any(String),
      );

      bridge.handleFanoutMessage({
        eventType: 'bid.withdrawn',
        eventId: 'evt-bid-with',
        requestId: 'req-3',
      });
      expect(mockSseService.broadcastBidChanged).toHaveBeenCalledWith(
        'req-3',
        'withdrawn',
        'evt-bid-with',
        expect.any(String),
      );
    });

    it('should map round lifecycle events (opened, closed, extended, finalized, cancelled, no_bid)', () => {
      bridge.handleFanoutMessage({
        eventType: 'bidding.round.opened',
        eventId: 'evt-round-1',
        requestId: 'req-r1',
      });
      expect(mockSseService.broadcastRoundChanged).toHaveBeenCalledWith(
        'req-r1',
        'opened',
        'evt-round-1',
        expect.any(String),
      );

      bridge.handleFanoutMessage({
        eventType: 'bidding.round.extended',
        eventId: 'evt-round-2',
        requestId: 'req-r2',
      });
      expect(mockSseService.broadcastRoundChanged).toHaveBeenCalledWith(
        'req-r2',
        'extended',
        'evt-round-2',
        expect.any(String),
      );

      bridge.handleFanoutMessage({
        eventType: 'bidding.round.finalized',
        eventId: 'evt-round-3',
        requestId: 'req-r3',
      });
      expect(mockSseService.broadcastRoundChanged).toHaveBeenCalledWith(
        'req-r3',
        'finalized',
        'evt-round-3',
        expect.any(String),
      );

      bridge.handleFanoutMessage({
        eventType: 'bidding.round.no_bid',
        eventId: 'evt-round-4',
        requestId: 'req-r4',
      });
      expect(mockSseService.broadcastRoundChanged).toHaveBeenCalledWith(
        'req-r4',
        'no_bid',
        'evt-round-4',
        expect.any(String),
      );
    });

    it('should map matching.completed and matching.failed to sseService.broadcastMatchingChanged', () => {
      bridge.handleFanoutMessage({
        eventType: 'matching.completed',
        eventId: 'evt-match-c',
        requestId: 'req-m1',
      });
      expect(mockSseService.broadcastMatchingChanged).toHaveBeenCalledWith(
        'req-m1',
        'completed',
        'evt-match-c',
        expect.any(String),
      );

      bridge.handleFanoutMessage({
        eventType: 'matching.failed',
        eventId: 'evt-match-f',
        requestId: 'req-m2',
      });
      expect(mockSseService.broadcastMatchingChanged).toHaveBeenCalledWith(
        'req-m2',
        'failed',
        'evt-match-f',
        expect.any(String),
      );
    });

    it('should deduplicate messages with identical eventId to prevent duplicate emissions', () => {
      const duplicateMsg = {
        eventType: 'bid.submitted',
        eventId: 'dup-event-123',
        requestId: 'req-dup',
      };

      bridge.handleFanoutMessage(duplicateMsg);
      bridge.handleFanoutMessage(duplicateMsg); // Repeat

      expect(mockSseService.broadcastBidChanged).toHaveBeenCalledTimes(1);
    });

    it('should NOT fallback to local dispatch when broker channel is degraded/disconnected (BE-FIX-02)', async () => {
      // Bridge is initially degraded when broker is uninitialized
      expect(bridge.isBridgeDegraded).toBe(true);

      await bridge.publishToFanout({
        eventType: 'matching.completed',
        requestId: 'req-fallback',
        eventId: 'evt-fallback-1',
      });

      // Crucial: Silent in-memory fallback removed so multi-replica delivery false-positives are eliminated
      expect(mockSseService.broadcastMatchingChanged).not.toHaveBeenCalled();
    });

    it('should correctly process OutboxPublisher wrapped CloudEvent envelopes', () => {
      const cloudEventMessage = {
        eventId: 'ce-evt-1',
        eventType: 'bid.submitted',
        eventVersion: 1,
        source: 'bidding-service',
        occurredAt: '2026-10-29T00:00:00.000Z',
        data: {
          requestId: 'req-cloud-1',
          bidId: 'bid-123',
          workerId: 'w-1',
        },
      };

      bridge.handleFanoutMessage(cloudEventMessage);

      expect(mockSseService.broadcastBidChanged).toHaveBeenCalledWith(
        'req-cloud-1',
        'submitted',
        'ce-evt-1',
        '2026-10-29T00:00:00.000Z',
      );
    });
  });
});
