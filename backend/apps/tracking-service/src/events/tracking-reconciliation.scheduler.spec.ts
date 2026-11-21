import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrackingReconciliationScheduler } from './tracking-reconciliation.scheduler.js';
import type { TrackingEventsService } from './tracking-events.service.js';

describe('TrackingReconciliationScheduler', () => {
  let scheduler: TrackingReconciliationScheduler;
  let eventsServiceMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    eventsServiceMock = {
      reconcilePendingOrders: vi.fn().mockResolvedValue({
        scanned: 1,
        flushedOrders: 1,
        stalledOrders: 0,
      }),
      countUnresolvedRejectedEvents: vi.fn().mockResolvedValue(0),
    };
    scheduler = new TrackingReconciliationScheduler(
      eventsServiceMock as unknown as TrackingEventsService,
    );
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    vi.useRealTimers();
  });

  it('should initialize interval onModuleInit and clear onModuleDestroy', () => {
    scheduler.onModuleInit();
    expect((scheduler as any).timer).toBeDefined();

    scheduler.onModuleDestroy();
    expect((scheduler as any).timer).toBeNull();
  });

  it('should trigger reconciliation and delegate to eventsService.reconcilePendingOrders', async () => {
    const result = await scheduler.triggerReconciliation();

    expect(eventsServiceMock.reconcilePendingOrders).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      scanned: 1,
      flushedOrders: 1,
      stalledOrders: 0,
    });
  });

  it('counts quarantined events during reconciliation', async () => {
    eventsServiceMock.countUnresolvedRejectedEvents.mockResolvedValue(3);
    const warn = vi.spyOn((scheduler as any).logger, 'warn');
    await scheduler.triggerReconciliation();
    expect(eventsServiceMock.countUnresolvedRejectedEvents).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('[REJECTED_TRACKING_EVENTS_ALERT] 3 unresolved events require replay');
  });

  it('should prevent overlapping executions when previous cycle is still running', async () => {
    let resolveFirst: any;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    eventsServiceMock.reconcilePendingOrders.mockReturnValueOnce(firstPromise);

    // Start first run
    const run1 = scheduler.triggerReconciliation();

    // Start second run while first is still pending
    const run2 = await scheduler.triggerReconciliation();

    expect(run2).toEqual({ scanned: 0, flushedOrders: 0, stalledOrders: 0 });

    resolveFirst({ scanned: 2, flushedOrders: 1, stalledOrders: 0 });
    const run1Result = await run1;
    expect(run1Result).toEqual({ scanned: 2, flushedOrders: 1, stalledOrders: 0 });
  });

  it('should handle errors gracefully without throwing', async () => {
    eventsServiceMock.reconcilePendingOrders.mockRejectedValueOnce(
      new Error('Redis connection failure'),
    );

    const result = await scheduler.triggerReconciliation();

    expect(result).toEqual({ scanned: 0, flushedOrders: 0, stalledOrders: 0 });
    expect((scheduler as any).isReconciling).toBe(false);
  });
});

