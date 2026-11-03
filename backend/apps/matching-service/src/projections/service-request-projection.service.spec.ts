import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ServiceRequestProjectionService } from './service-request-projection.service.js';

describe('ServiceRequestProjectionService (FIX-01 Matching Tombstones & Event Ordering)', () => {
  let service: ServiceRequestProjectionService;
  let mockPrisma: any;
  let mockStore: Map<string, any>;

  beforeEach(() => {
    mockStore = new Map<string, any>();

    mockPrisma = {
      schema: 'matching_service',
      serviceRequestProjection: {
        createMany: vi.fn(async ({ data, skipDuplicates }: { data: any; skipDuplicates?: boolean }) => {
          const records = Array.isArray(data) ? data : [data];
          let count = 0;
          for (const item of records) {
            if (mockStore.has(item.id)) {
              if (skipDuplicates) continue;
              throw new Error(`Unique constraint failed on id: ${item.id}`);
            }
            mockStore.set(item.id, {
              ...item,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            count++;
          }
          return { count };
        }),
        updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
          let count = 0;
          for (const [id, record] of mockStore.entries()) {
            if (where.id && record.id !== where.id) continue;
            if (where.requestCode && record.requestCode !== where.requestCode) continue;
            if (where.matchingRevision !== undefined) {
              if (typeof where.matchingRevision === 'object' && where.matchingRevision.lt !== undefined) {
                if (!(record.matchingRevision < where.matchingRevision.lt)) continue;
              } else if (record.matchingRevision !== where.matchingRevision) {
                continue;
              }
            }
            if (where.status) {
              if (where.status.in && !where.status.in.includes(record.status)) continue;
              if (typeof where.status === 'string' && record.status !== where.status) continue;
            }

            mockStore.set(id, {
              ...record,
              ...data,
              updatedAt: new Date(),
            });
            count++;
          }
          return { count };
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return mockStore.get(where.id) || null;
        }),
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
          const record = mockStore.get(where.id);
          if (!record) throw new Error(`Record with id ${where.id} not found`);
          return record;
        }),
      },
    };

    service = new ServiceRequestProjectionService(mockPrisma);
  });

  const samplePublishData = {
    id: 'req-001',
    requestCode: 'REQ-A1B2C3D4',
    customerUserId: 'user-cust-1',
    serviceId: 'srv-cleaning-1',
    description: 'Sửa chữa máy giặt Daikin',
    scheduledAt: '2026-12-01T10:00:00.000Z',
    addressText: '123 Nguyễn Văn Linh, Đà Nẵng',
    latitude: 16.0748,
    longitude: 108.1499,
    matchingRevision: 1,
    status: 'open_for_bidding',
    biddingClosesAt: '2026-12-01T09:00:00.000Z',
    selectionExpiresAt: '2026-12-01T12:00:00.000Z',
  };

  describe('1. Normal in-order event sequence', () => {
    it('creates open_for_bidding projection on service_request.published', async () => {
      const projection = await service.upsertPublishedRequest(samplePublishData);

      expect(projection.id).toBe('req-001');
      expect(projection.requestCode).toBe('REQ-A1B2C3D4');
      expect(projection.status).toBe('open_for_bidding');
      expect(projection.matchingRevision).toBe(1);
      expect(projection.customerUserId).toBe('user-cust-1');
    });

    it('transitions open_for_bidding -> bidding_closed -> converted_to_order', async () => {
      await service.upsertPublishedRequest(samplePublishData);

      await service.updateRequestStatus('req-001', 'bidding_closed');
      let projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('bidding_closed');

      await service.updateRequestStatus('req-001', 'converted_to_order');
      projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('converted_to_order');
    });
  });

  describe('2. Out-of-order events: Closing events arrive BEFORE service_request.published', () => {
    it('backfills metadata for early bidding_closed tombstone without reopening request', async () => {
      // Step 1: bidding_closed arrives early
      await service.updateRequestStatus('req-001', 'bidding_closed');
      const tombstone = mockStore.get('req-001');
      expect(tombstone.requestCode).toBe('TOMBSTONE');
      expect(tombstone.status).toBe('bidding_closed');
      expect(tombstone.matchingRevision).toBe(0);

      // Step 2: published arrives late
      const projection = await service.upsertPublishedRequest(samplePublishData);

      // Backfilled correctly
      expect(projection.id).toBe('req-001');
      expect(projection.requestCode).toBe('REQ-A1B2C3D4');
      expect(projection.customerUserId).toBe('user-cust-1');
      expect(projection.serviceId).toBe('srv-cleaning-1');
      expect(projection.matchingRevision).toBe(1);
      // STRICT: Status MUST remain bidding_closed, never reopened to open_for_bidding
      expect(projection.status).toBe('bidding_closed');
    });

    it('backfills metadata for early expired tombstone without reopening request', async () => {
      await service.updateRequestStatus('req-001', 'expired');
      const projection = await service.upsertPublishedRequest(samplePublishData);

      expect(projection.requestCode).toBe('REQ-A1B2C3D4');
      expect(projection.customerUserId).toBe('user-cust-1');
      expect(projection.status).toBe('expired');
    });

    it('backfills metadata for early cancelled tombstone without reopening request', async () => {
      await service.updateRequestStatus('req-001', 'cancelled');
      const projection = await service.upsertPublishedRequest(samplePublishData);

      expect(projection.requestCode).toBe('REQ-A1B2C3D4');
      expect(projection.customerUserId).toBe('user-cust-1');
      expect(projection.status).toBe('cancelled');
    });

    it('backfills metadata for early converted_to_order tombstone without reopening request', async () => {
      await service.updateRequestStatus('req-001', 'converted_to_order');
      const projection = await service.upsertPublishedRequest(samplePublishData);

      expect(projection.requestCode).toBe('REQ-A1B2C3D4');
      expect(projection.customerUserId).toBe('user-cust-1');
      expect(projection.status).toBe('converted_to_order');
    });

    it('handles sequence: early bidding_closed -> early converted_to_order -> late published', async () => {
      await service.updateRequestStatus('req-001', 'bidding_closed');
      await service.updateRequestStatus('req-001', 'converted_to_order');

      const tombstone = mockStore.get('req-001');
      expect(tombstone.status).toBe('converted_to_order');
      expect(tombstone.requestCode).toBe('TOMBSTONE');

      const projection = await service.upsertPublishedRequest(samplePublishData);
      expect(projection.requestCode).toBe('REQ-A1B2C3D4');
      expect(projection.status).toBe('converted_to_order');
    });
  });

  describe('3. Terminal status invariants and invalid reopenings', () => {
    it('never allows bidding_closed to overwrite a cancelled request', async () => {
      await service.upsertPublishedRequest(samplePublishData);
      await service.updateRequestStatus('req-001', 'cancelled');

      // Late bidding_closed event arrives
      await service.updateRequestStatus('req-001', 'bidding_closed');
      const projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('cancelled');
    });

    it('never allows bidding_closed to overwrite an expired request', async () => {
      await service.upsertPublishedRequest(samplePublishData);
      await service.updateRequestStatus('req-001', 'expired');

      // Late bidding_closed event arrives
      await service.updateRequestStatus('req-001', 'bidding_closed');
      const projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('expired');
    });

    it('never allows bidding_closed to overwrite a converted_to_order request', async () => {
      await service.upsertPublishedRequest(samplePublishData);
      await service.updateRequestStatus('req-001', 'converted_to_order');

      await service.updateRequestStatus('req-001', 'bidding_closed');
      const projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('converted_to_order');
    });

    it('throws on unsupported lifecycle status', async () => {
      await expect(service.updateRequestStatus('req-001', 'random_invalid_status'))
        .rejects.toThrow('Unsupported request lifecycle status: random_invalid_status');
    });
  });

  describe('4. Idempotency & duplicate event handling', () => {
    it('is idempotent when service_request.published arrives multiple times', async () => {
      const first = await service.upsertPublishedRequest(samplePublishData);
      const second = await service.upsertPublishedRequest(samplePublishData);

      expect(first.id).toBe(second.id);
      expect(mockStore.size).toBe(1);
    });

    it('is idempotent when duplicate updateRequestStatus calls arrive', async () => {
      await service.upsertPublishedRequest(samplePublishData);
      await service.updateRequestStatus('req-001', 'bidding_closed');
      await service.updateRequestStatus('req-001', 'bidding_closed');

      const projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('bidding_closed');
    });
  });

  describe('5. updateMatchingInputs handling', () => {
    it('throws when matching inputs arrive on unhydrated TOMBSTONE', async () => {
      await service.updateRequestStatus('req-001', 'bidding_closed');

      await expect(service.updateMatchingInputs({
        id: 'req-001',
        matchingRevision: 2,
        description: 'New description',
      })).rejects.toThrow('Request projection not yet available');
    });

    it('updates matching inputs when request is published and revision is greater', async () => {
      await service.upsertPublishedRequest(samplePublishData);

      await service.updateMatchingInputs({
        id: 'req-001',
        matchingRevision: 2,
        description: 'Mô tả sửa đổi',
      });

      const projection = await service.getProjection('req-001');
      expect(projection?.matchingRevision).toBe(2);
      expect(projection?.description).toBe('Mô tả sửa đổi');
    });
  });

  describe('6. Dynamic expiration in getProjection', () => {
    it('returns expired status if selectionExpiresAt has elapsed', async () => {
      await service.upsertPublishedRequest({
        ...samplePublishData,
        selectionExpiresAt: new Date(Date.now() - 5000).toISOString(),
      });

      const projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('expired');
    });

    it('returns bidding_closed status if biddingClosesAt has elapsed', async () => {
      await service.upsertPublishedRequest({
        ...samplePublishData,
        biddingClosesAt: new Date(Date.now() - 5000).toISOString(),
        selectionExpiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      const projection = await service.getProjection('req-001');
      expect(projection?.status).toBe('bidding_closed');
    });
  });
});
