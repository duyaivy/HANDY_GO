import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SseService } from '../src/sse/sse.service.js';
import type { SseClientConnection } from '../src/sse/sse.interfaces.js';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

describe('SseService (BE-01 / BE-07)', () => {
  let sseService: SseService;

  beforeEach(() => {
    vi.useFakeTimers();
    sseService = new SseService();
  });

  afterEach(() => {
    sseService.onModuleDestroy();
    vi.useRealTimers();
  });

  function createMockResponse() {
    const writtenData: string[] = [];
    const eventHandlers: Record<string, (() => void)[]> = {};

    return {
      writtenData,
      writeHead: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        writtenData.push(chunk);
        return true;
      }),
      end: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
      }),
      emitEvent: (event: string) => {
        eventHandlers[event]?.forEach((h) => h());
      },
    };
  }

  it('should register client, set required SSE headers, and immediately emit ready event', () => {
    const mockRes = createMockResponse();
    const requestId = 'req-123';
    const connection: SseClientConnection = {
      id: 'conn-1',
      requestId,
      userId: 'user-1',
      roles: ['customer'],
      res: mockRes as any,
      connectedAt: new Date('2026-10-28T23:30:00.000Z'),
    };

    sseService.registerClient(connection);

    // 1. Verify headers
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    expect(mockRes.flushHeaders).toHaveBeenCalled();

    // 2. Verify immediate ready event
    expect(mockRes.writtenData.length).toBeGreaterThan(0);
    const readyFrame = mockRes.writtenData[0];
    expect(readyFrame).toContain('event: ready\n');
    expect(readyFrame).toContain('"requestId":"req-123"');
    expect(readyFrame).toContain('"heartbeatIntervalMs":15000');
    expect(readyFrame).toMatch(/\n\n$/);

    expect(sseService.getClientCount(requestId)).toBe(1);
    expect(sseService.getClientCount()).toBe(1);
  });

  it('should emit keepalive comment (:keepalive <iso-timestamp>) every 15 seconds', () => {
    const mockRes = createMockResponse();
    const connection: SseClientConnection = {
      id: 'conn-heartbeat',
      requestId: 'req-heartbeat',
      userId: 'user-hb',
      roles: ['customer'],
      res: mockRes as any,
      connectedAt: new Date(),
    };

    sseService.registerClient(connection);
    mockRes.writtenData.length = 0; // Clear ready event

    // Advance timer by 15 seconds
    vi.advanceTimersByTime(15000);

    expect(mockRes.writtenData.length).toBe(1);
    expect(mockRes.writtenData[0]).toMatch(/^:keepalive \d{4}-\d{2}-\d{2}T/);
    expect(mockRes.writtenData[0].endsWith('\n\n')).toBe(true);

    // Advance another 15 seconds
    vi.advanceTimersByTime(15000);
    expect(mockRes.writtenData.length).toBe(2);
  });

  it('should clean up client on disconnect (res close event) to prevent memory leaks', () => {
    const mockRes = createMockResponse();
    const requestId = 'req-disconnect';
    const connection: SseClientConnection = {
      id: 'conn-disc',
      requestId,
      userId: 'user-disc',
      roles: ['worker'],
      res: mockRes as any,
      connectedAt: new Date(),
    };

    sseService.registerClient(connection);
    expect(sseService.getClientCount(requestId)).toBe(1);

    // Simulate socket disconnect
    mockRes.emitEvent('close');

    expect(sseService.getClientCount(requestId)).toBe(0);
    expect(sseService.getClientCount()).toBe(0);
  });

  it('should enforce bounded per-request connection limits', () => {
    const requestId = 'req-overflow';

    for (let i = 0; i < sseService.MAX_CONNECTIONS_PER_REQUEST; i++) {
      const mockRes = createMockResponse();
      sseService.registerClient({
        id: `conn-${i}`,
        requestId,
        userId: `user-${i}`,
        roles: ['worker'],
        res: mockRes as any,
        connectedAt: new Date(),
      });
    }

    expect(sseService.getClientCount(requestId)).toBe(
      sseService.MAX_CONNECTIONS_PER_REQUEST,
    );

    // Attempt 101th connection should throw BadRequestException
    const mockResOverflow = createMockResponse();
    expect(() =>
      sseService.registerClient({
        id: 'conn-overflow',
        requestId,
        userId: 'user-overflow',
        roles: ['worker'],
        res: mockResOverflow as any,
        connectedAt: new Date(),
      }),
    ).toThrow(BadRequestException);
  });

  it('should broadcast bid.changed event with ZERO confidential data (no amounts, competitor IDs, or messages)', () => {
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();
    const targetRequestId = 'req-target';
    const otherRequestId = 'req-other';

    sseService.registerClient({
      id: 'c1',
      requestId: targetRequestId,
      userId: 'u1',
      roles: ['customer'],
      res: mockRes1 as any,
      connectedAt: new Date(),
    });

    sseService.registerClient({
      id: 'c2',
      requestId: otherRequestId,
      userId: 'u2',
      roles: ['worker'],
      res: mockRes2 as any,
      connectedAt: new Date(),
    });

    mockRes1.writtenData.length = 0;
    mockRes2.writtenData.length = 0;

    sseService.broadcastBidChanged(
      targetRequestId,
      'submitted',
      'event-uuid-1',
      '2026-10-28T23:30:15.000Z',
    );

    // Client on targetRequestId must receive the frame
    expect(mockRes1.writtenData.length).toBe(1);
    const frame = mockRes1.writtenData[0];
    expect(frame).toContain('event: bid.changed\n');

    const dataMatch = frame.match(/data: (\{.*\})\n\n/);
    expect(dataMatch).not.toBeNull();
    const parsedData = JSON.parse(dataMatch![1]);

    expect(parsedData).toEqual({
      eventId: 'event-uuid-1',
      requestId: targetRequestId,
      kind: 'submitted',
      occurredAt: '2026-10-28T23:30:15.000Z',
    });

    // CRITICAL: Zero confidential leaks!
    expect(parsedData).not.toHaveProperty('amount');
    expect(parsedData).not.toHaveProperty('price');
    expect(parsedData).not.toHaveProperty('workerId');
    expect(parsedData).not.toHaveProperty('workerUserId');
    expect(parsedData).not.toHaveProperty('message');

    // Client on other request must NOT receive anything
    expect(mockRes2.writtenData.length).toBe(0);
  });

  it('should broadcast round.changed and matching.changed events', () => {
    const mockRes = createMockResponse();
    const requestId = 'req-lifecycle';

    sseService.registerClient({
      id: 'c-life',
      requestId,
      userId: 'u-life',
      roles: ['customer'],
      res: mockRes as any,
      connectedAt: new Date(),
    });

    mockRes.writtenData.length = 0;

    // Test round.changed
    sseService.broadcastRoundChanged(requestId, 'extended', 'evt-round-1');
    expect(mockRes.writtenData[0]).toContain('event: round.changed\n');
    expect(mockRes.writtenData[0]).toContain('"kind":"extended"');

    // Test matching.changed
    sseService.broadcastMatchingChanged(requestId, 'completed', 'evt-match-1');
    expect(mockRes.writtenData[1]).toContain('event: matching.changed\n');
    expect(mockRes.writtenData[1]).toContain('"kind":"completed"');
  });
});
