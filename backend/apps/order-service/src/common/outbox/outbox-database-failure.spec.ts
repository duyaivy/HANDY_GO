import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderOutboxPublisherService } from './order-outbox-publisher.service.js';
import { OutboxPublisherService } from '@app/common';
import { MatchingOutboxPublisherService } from '../../../../matching-service/src/outbox/matching-outbox-publisher.service.js';

const failure = Object.assign(new Error('XX000 EMAXCONNSESSION postgresql://user:secret@db/production'), { code: 'XX000' });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe.each([OrderOutboxPublisherService, OutboxPublisherService, MatchingOutboxPublisherService])('%s transient database failure', (Publisher) => {
  function setup() {
    const repo = { findPendingEvents: vi.fn().mockResolvedValue([]), markPublished: vi.fn(), scheduleRetry: vi.fn(), scheduleDlqRetry: vi.fn(), markFailed: vi.fn(), incrementPublishAttempts: vi.fn() };
    const broker = { emit: vi.fn().mockResolvedValue(undefined) };
    const service = new Publisher(repo as never, broker as never);
    return { repo, broker, service };
  }
  it('contains scan rejection, logs sanitized error and bounds repeated manual/timer retries', async () => {
    vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0);
    const { repo, service, broker } = setup();
    const logger = vi.spyOn((service as any).logger, 'error').mockImplementation(() => {});
    repo.findPendingEvents.mockRejectedValue(failure);
    await expect(service.publishPendingEvents()).resolves.toBe(0);
    for (let i = 0; i < 100; i++) await service.triggerPublish();
    expect(repo.findPendingEvents).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    await service.publishPendingEvents();
    await vi.advanceTimersByTimeAsync(3000);
    await service.publishPendingEvents();
    expect(repo.findPendingEvents).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    repo.findPendingEvents.mockResolvedValue([]);
    await service.publishPendingEvents();
    await service.publishPendingEvents();
    expect(repo.findPendingEvents).toHaveBeenCalledTimes(4);
    expect(broker.emit).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/secret|postgresql|production/);
  });
  it('timer failures never reject and back off instead of polling on every tick', async () => {
    vi.useFakeTimers(); vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { repo, service } = setup();
    vi.spyOn((service as any).logger, 'error').mockImplementation(() => {});
    repo.findPendingEvents.mockRejectedValue(failure);
    service.onModuleInit();
    try {
      await vi.advanceTimersByTimeAsync(60000);
      expect(repo.findPendingEvents).toHaveBeenCalledTimes(5);
    } finally { service.onModuleDestroy(); }
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not overlap scans or run after shutdown', async () => {
    const { repo, service } = setup();
    let resolve!: (events: never[]) => void;
    repo.findPendingEvents.mockReturnValue(new Promise(r => { resolve = r; }));
    const running = service.publishPendingEvents();
    await expect(service.publishPendingEvents()).resolves.toBe(0);
    expect(repo.findPendingEvents).toHaveBeenCalledTimes(1);
    resolve([]); await running;
    service.onModuleDestroy();
    await service.triggerPublish();
    expect(repo.findPendingEvents).toHaveBeenCalledTimes(1);
  });
  it('preserves event ID and pending row when broker succeeds but database update fails', async () => {
    const { repo, broker, service } = setup();
    repo.findPendingEvents.mockResolvedValue([{ id: 'stable-id', eventType: 'order.created', payload: { eventId: 'stable-id' }, status: 'pending', retryCount: 4, publishAttempts: 4 }]);
    repo.markPublished.mockRejectedValue(failure);
    await expect(service.publishPendingEvents()).resolves.toBe(0);
    expect(broker.emit).toHaveBeenCalledTimes(1);
    expect(broker.emit.mock.calls[0][1]).toMatchObject({ eventId: 'stable-id' });
    expect(repo.markFailed).not.toHaveBeenCalled();
    expect(repo.scheduleRetry).not.toHaveBeenCalled();
    expect(repo.incrementPublishAttempts).not.toHaveBeenCalled();
  });
});
