import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoundsController } from './rounds.controller.js';
import { RoundsService } from './rounds.service.js';

describe('RoundsController', () => {
  let controller: RoundsController;
  let roundsServiceMock: any;

  beforeEach(() => {
    roundsServiceMock = {
      getBiddingStatus: vi.fn(),
    };

    controller = new RoundsController(roundsServiceMock as unknown as RoundsService);
  });

  it('should call getBiddingStatus and wrap in success envelope', async () => {
    const mockData = {
      roundId: 'round-1',
      serviceRequestId: 'req-1',
      status: 'open',
      opensAt: new Date(),
      closesAt: new Date(),
      bidCount: 5,
      activeBidCount: 3,
      timeRemainingSeconds: 3600,
      isExpired: false,
    };
    roundsServiceMock.getBiddingStatus.mockResolvedValue(mockData);

    const response = await controller.getStatus('00000000-0000-0000-0000-000000000001');

    expect(roundsServiceMock.getBiddingStatus).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
    );
    expect(response.statusCode).toBe(200);
    expect(response.data).toEqual(mockData);
  });

  it('should support getStatusAlias', async () => {
    const mockData = {
      roundId: 'round-1',
      serviceRequestId: 'req-1',
      status: 'open',
    };
    roundsServiceMock.getBiddingStatus.mockResolvedValue(mockData);

    const response = await controller.getStatusAlias('00000000-0000-0000-0000-000000000001');

    expect(response.statusCode).toBe(200);
    expect(response.data).toEqual(mockData);
  });
});
