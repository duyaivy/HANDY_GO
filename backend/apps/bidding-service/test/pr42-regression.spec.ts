import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { BidsService } from '../src/bids/bids.service.js';
import { RoundsService } from '../src/rounds/rounds.service.js';
import { RequestEligibilityVerifierService } from '../src/bids/services/request-eligibility-verifier.service.js';

afterEach(() => vi.unstubAllGlobals());

describe('PR42 previous fixes regression', () => {
  it.each(['withdrawn', 'expired', 'rejected', 'selected', 'active'])(
    'PR42-03 preserves %s bid history when Order finalizes the round',
    async (status) => {
      const round = { id: 'round', serviceRequestId: 'request', status: 'closed' };
      const bid = { id: 'bid', biddingRoundId: 'round', serviceRequestId: 'request', workerId: 'worker', status };
      const db: any = {
        biddingRound: {
          findUnique: vi.fn(async () => ({ ...round })),
          updateMany: vi.fn(async () => { round.status = 'finalized'; return { count: 1 }; }),
        },
        bid: {
          findUnique: vi.fn(async () => ({ ...bid })),
          update: vi.fn(async ({ data }) => Object.assign(bid, data)),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        outboxEvent: { create: vi.fn() },
      };
      db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
      const service = new RoundsService(db);
      const event = { serviceRequestId: 'request', orderId: 'order', selectedBidId: 'bid', winningWorkerId: 'worker' };
      await service.finalizeRound(event);
      await service.finalizeRound(event);
      expect(round.status).toBe('finalized');
      expect(bid.status).toBe(status === 'active' ? 'selected' : status);
      expect(db.outboxEvent.create).toHaveBeenCalledTimes(1);
      expect(db.bid.updateMany).toHaveBeenCalledWith({
        where: { biddingRoundId: 'round', id: { not: 'bid' }, status: 'active' },
        data: { status: 'rejected' },
      });
    },
  );

  it('PR42-04 applies the same validity cutoff to results, totals and bidder IDs', async () => {
    const db: any = {
      bid: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
      biddingRound: { findUnique: vi.fn(async () => ({ customerId: 'customer' })) },
    };
    const service = new BidsService(db, {} as RoundsService);
    await service.getBidsForRequest('request', { page: 1, limit: 20, status: 'active' });
    const where = db.bid.count.mock.calls[0][0].where;
    expect(where).toEqual({ serviceRequestId: 'request', status: 'active', OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }] });
    for (const [query] of db.bid.findMany.mock.calls) expect(query.where).toEqual(where);
  });

  it.each(['active', 'withdrawn', 'selected', 'rejected'])(
    'PR42-07 filters My Bids by authenticated worker/request without discarding %s',
    async (status) => {
      const db: any = { bid: {
        count: vi.fn(async () => 1),
        findMany: vi.fn(async () => [{ id: 'target', workerId: 'worker', serviceRequestId: 'request', status, amount: 100, _count: { revisions: 0 } }]),
      } };
      const result = await new BidsService(db, {} as RoundsService).getMyBids('worker', { page: 1, limit: 20, serviceRequestId: 'request' });
      expect(result.items[0].status).toBe(status);
      expect(db.bid.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workerId: 'worker', serviceRequestId: 'request' }, skip: 0, take: 20 }));
      expect(db.bid.count).toHaveBeenCalledWith({ where: { workerId: 'worker', serviceRequestId: 'request' } });
    },
  );

  it.each([
    { profile: { isVerified: false, serviceIds: ['service'] }, allowed: false },
    { profile: { isVerified: true, serviceIds: ['different'] }, allowed: false },
    { profile: { isVerified: true, serviceIds: ['service'] }, allowed: true },
    { profile: null, allowed: false },
  ])('PR42-06 enforces real User Trust profile contract: $profile', async ({ profile, allowed }) => {
    const fetchMock = vi.fn(async () => ({ status: 200, json: async () => ({ data: profile }) }));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new RequestEligibilityVerifierService({ getUrl: () => 'http://trust', internalServiceSecret: 'internal-test' } as any);
    const operation = verifier.verifyWorkerHardEligibility('worker', 'service');
    if (allowed) await expect(operation).resolves.toBeUndefined();
    else await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMock).toHaveBeenCalledWith('http://trust/api/v1/internal/v1/workers/worker/matching-profile', expect.objectContaining({ headers: { 'x-internal-secret': 'internal-test' }, signal: expect.any(AbortSignal) }));
  });

  it('PR42-06 fails closed when User Trust is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 503 })));
    const verifier = new RequestEligibilityVerifierService({ getUrl: () => 'http://trust', internalServiceSecret: 'internal-test' } as any);
    await expect(verifier.verifyWorkerHardEligibility('worker', 'service')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
