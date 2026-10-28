import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RoundExpirationSchedulerService } from './round-expiration.scheduler.js';
import { RoundsService } from './rounds.service.js';
import { RabbitMQService } from '@app/rabbitmq';
import { EVENT_PATTERNS } from '@app/common';

describe('RoundExpirationSchedulerService', () => {
  let scheduler: RoundExpirationSchedulerService;
  let roundsServiceMock: any;
  let rabbitmqMock: any;

  beforeEach(() => {
    roundsServiceMock = {
      findOverdueOpenRounds: vi.fn(),
      expireRoundIfNeeded: vi.fn(),
    };

    rabbitmqMock = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    scheduler = new RoundExpirationSchedulerService(
      roundsServiceMock as unknown as RoundsService,
      rabbitmqMock as unknown as RabbitMQService,
    );
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    vi.restoreAllMocks();
  });

  it('nên không làm gì khi không có phiên nào quá hạn', async () => {
    roundsServiceMock.findOverdueOpenRounds.mockResolvedValue([]);

    const count = await scheduler.scanAndTriggerExpiration();

    expect(count).toBe(0);
    expect(rabbitmqMock.emit).not.toHaveBeenCalled();
  });

  it('nên phát sự kiện RabbitMQ bidding.round.expire_check cho các phiên quá hạn', async () => {
    const mockRounds = [
      {
        id: 'round-1',
        serviceRequestId: 'req-1',
        closesAt: new Date(Date.now() - 5000),
      },
      {
        id: 'round-2',
        serviceRequestId: 'req-2',
        closesAt: new Date(Date.now() - 10000),
      },
    ];

    roundsServiceMock.findOverdueOpenRounds.mockResolvedValue(mockRounds);

    const count = await scheduler.scanAndTriggerExpiration();

    expect(count).toBe(2);
    expect(rabbitmqMock.emit).toHaveBeenCalledTimes(2);
    expect(rabbitmqMock.emit).toHaveBeenCalledWith(
      EVENT_PATTERNS.BIDDING_ROUND_EXPIRE_CHECK,
      expect.objectContaining({
        roundId: 'round-1',
        serviceRequestId: 'req-1',
      }),
    );
    expect(rabbitmqMock.emit).toHaveBeenCalledWith(
      EVENT_PATTERNS.BIDDING_ROUND_EXPIRE_CHECK,
      expect.objectContaining({
        roundId: 'round-2',
        serviceRequestId: 'req-2',
      }),
    );
  });

  it('tự động fallback đóng phiên trực tiếp nếu RabbitMQ gặp sự cố', async () => {
    const mockRounds = [
      {
        id: 'round-err',
        serviceRequestId: 'req-err',
        closesAt: new Date(Date.now() - 1000),
      },
    ];

    roundsServiceMock.findOverdueOpenRounds.mockResolvedValue(mockRounds);
    rabbitmqMock.emit.mockRejectedValue(new Error('RabbitMQ connection lost'));

    const count = await scheduler.scanAndTriggerExpiration();

    expect(count).toBe(1);
    expect(roundsServiceMock.expireRoundIfNeeded).toHaveBeenCalledWith(
      mockRounds[0],
      expect.any(Date),
    );
  });
});
