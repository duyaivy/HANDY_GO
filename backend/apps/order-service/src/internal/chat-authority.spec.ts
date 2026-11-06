import { describe, expect, it, vi } from 'vitest';
import { InternalOrderService } from './internal-order.service.js';
import { BidsService } from '../../../bidding-service/src/bids/bids.service.js';
const id = '11111111-1111-4111-8111-111111111111';
describe('chat authority snapshots', () => {
  it('returns selected order and actual persisted versions', async () => {
    const record = {
      id,
      customerUserId: id,
      status: 'converted_to_order',
      version: 7,
      order: {
        id,
        workerUserId: id,
        status: 'completed',
        version: 9,
        completedAt: new Date('2026-11-06T00:00:00Z'),
      },
    };
    const db: any = {
      serviceRequest: { findUnique: vi.fn().mockResolvedValue(record) },
    };
    db.$transaction = (fn: any) => fn(db);
    const result = await new InternalOrderService(db).getChatState(id);
    expect(result.version).toBe(7);
    expect(result.order).toEqual({
      orderId: id,
      workerId: id,
      status: 'completed',
      version: 9,
      completedAt: '2026-11-06T00:00:00.000Z',
    });
  });
  it.each(['withdrawn', 'expired', 'selected', 'rejected'])(
    'does not grant active eligibility to %s',
    async (status) => {
      const db: any = {
        bid: {
          findUnique: vi
            .fn()
            .mockResolvedValue({
              id,
              serviceRequestId: id,
              workerId: id,
              status,
              version: 2,
              submittedAt: new Date(),
              validUntil: null,
              biddingRound: { status: 'open' },
            }),
        },
      };
      const result = await new BidsService(db, {} as any).getChatEligibility(
        id,
      );
      expect(result.eligible).toBe(false);
      expect(result.status).toBe(status);
    },
  );
  it('fails closed for expired active bid', async () => {
    const db: any = {
      bid: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id,
            serviceRequestId: id,
            workerId: id,
            status: 'active',
            version: 1,
            submittedAt: new Date(),
            validUntil: new Date(0),
            biddingRound: { status: 'open' },
          }),
      },
    };
    expect(
      (await new BidsService(db, {} as any).getChatEligibility(id)).eligible,
    ).toBe(false);
  });
});
