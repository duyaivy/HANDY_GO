import { describe, expect, it, vi } from 'vitest';
import { DashboardBidsController } from './dashboard-bids.controller.js';

describe('internal dashboard bid activity', () => {
  it('includes first submissions and revised bids in the selected period', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ workerId: 'worker-1' }]);
    const controller = new DashboardBidsController({
      $queryRaw: queryRaw,
    } as never);
    const result = await controller.workersWithBids(
      '2026-11-14T17:00:00.000Z',
      '2026-11-15T08:00:00.000Z',
    );
    expect(result.data).toEqual(['worker-1']);
    const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(sql).toContain('bidding_service.bids');
    expect(sql).toContain('bidding_service.bid_revisions');
    expect(sql).toContain('UNION');
  });

  it('rejects a reversed period', async () => {
    const controller = new DashboardBidsController({
      $queryRaw: vi.fn(),
    } as never);
    await expect(
      controller.workersWithBids(
        '2026-11-16T00:00:00Z',
        '2026-11-15T00:00:00Z',
      ),
    ).rejects.toThrow();
  });
});
