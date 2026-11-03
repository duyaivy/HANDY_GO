import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceRequestProjectionService } from '../src/projections/service-request-projection.service.js';

// Model the atomic PostgreSQL insert-on-conflict and conditional updates. The
// companion matching-reliability-db suite exercises these races on PostgreSQL.
describe('request projection lifecycle', () => {
  let row: any;
  let service: ServiceRequestProjectionService;
  const published = {
    id: 'request',
    requestCode: 'REQ-real',
    customerUserId: 'customer',
    serviceId: 'service',
    description: 'Repair',
    addressText: 'Da Nang',
    latitude: 16,
    longitude: 108,
    matchingRevision: 1,
    scheduledAt: '2030-01-02T00:00:00Z',
    biddingClosesAt: '2030-01-01T00:00:00Z',
    selectionExpiresAt: '2030-01-01T01:00:00Z',
  };
  beforeEach(() => {
    row = undefined;
    const model = {
      createMany: vi.fn(async ({ data, skipDuplicates }) => {
        if (row && !skipDuplicates) throw new Error('unique conflict');
        if (!row) row = { ...data };
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        if (!row) return { count: 0 };
        if (where.requestCode && row.requestCode !== where.requestCode)
          return { count: 0 };
        if (
          typeof where.matchingRevision === 'number' &&
          row.matchingRevision !== where.matchingRevision
        )
          return { count: 0 };
        if (
          where.matchingRevision?.lt &&
          row.matchingRevision >= where.matchingRevision.lt
        )
          return { count: 0 };
        if (where.status && !where.status.in.includes(row.status))
          return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      }),
      findUnique: vi.fn(async () => row),
      findUniqueOrThrow: vi.fn(async () => {
        if (!row) throw new Error('missing');
        return row;
      }),
    };
    service = new ServiceRequestProjectionService({
      serviceRequestProjection: model,
    } as any);
  });
  it.each(['cancelled', 'bidding_closed', 'expired', 'converted_to_order'])(
    'hydrates every field of an early %s without reopening',
    async (status) => {
      await service.updateRequestStatus(published.id, status);
      await service.upsertPublishedRequest(published);
      await service.upsertPublishedRequest(published);
      expect(row).toEqual({
        ...published,
        status,
        scheduledAt: new Date(published.scheduledAt),
        biddingClosesAt: new Date(published.biddingClosesAt),
        selectionExpiresAt: new Date(published.selectionExpiresAt),
      });
    },
  );
  it.each(['cancelled', 'bidding_closed', 'expired', 'converted_to_order'])(
    'converges on %s with simultaneous duplicate publication and closure',
    async (status) => {
      await Promise.all([
        service.upsertPublishedRequest(published),
        service.updateRequestStatus(published.id, status),
        service.upsertPublishedRequest(published),
        service.updateRequestStatus(published.id, status),
      ]);
      expect(row).toMatchObject({
        requestCode: 'REQ-real',
        status,
        matchingRevision: 1,
      });
    },
  );
  it('allows published -> bidding_closed -> order.created but not replay reopening', async () => {
    await service.upsertPublishedRequest(published);
    await service.updateRequestStatus(published.id, 'bidding_closed');
    await service.updateRequestStatus(published.id, 'converted_to_order');
    await service.updateRequestStatus(published.id, 'expired');
    await service.upsertPublishedRequest(published);
    expect(row.status).toBe('converted_to_order');
  });
  it('does not roll back newer metadata on replay after cancellation', async () => {
    await service.upsertPublishedRequest(published);
    await service.updateMatchingInputs({
      id: published.id,
      matchingRevision: 2,
      description: 'Updated',
    });
    await service.updateRequestStatus(published.id, 'cancelled');
    await service.upsertPublishedRequest(published);
    expect(row).toMatchObject({
      matchingRevision: 2,
      description: 'Updated',
      status: 'cancelled',
    });
  });
  it('retries input updates arriving before tombstone hydration', async () => {
    await service.updateRequestStatus(published.id, 'bidding_closed');
    await expect(
      service.updateMatchingInputs({ id: published.id, matchingRevision: 2 }),
    ).rejects.toThrow('not yet available');
    await service.upsertPublishedRequest(published);
    await service.updateMatchingInputs({
      id: published.id,
      matchingRevision: 2,
    });
    expect(row.matchingRevision).toBe(2);
  });
  it('rejects unsupported transitions without creating an open tombstone', async () => {
    await expect(
      service.updateRequestStatus(published.id, 'open_for_bidding'),
    ).rejects.toThrow('Unsupported');
    expect(row).toBeUndefined();
  });
});
