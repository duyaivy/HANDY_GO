import { Injectable } from '@nestjs/common';
import { MatchingPrismaService, MatchingPrisma } from '@app/database';

@Injectable()
export class ServiceRequestProjectionService {
  constructor(private readonly prisma: MatchingPrismaService) {}

  /**
   * Upserts the projection when a service request is published.
   * If a terminal tombstone already exists (from an early cancelled / order.created event),
   * updates the projection metadata while strictly preserving the terminal status.
   */
  async upsertPublishedRequest(data: {
    id: string;
    requestCode: string;
    customerUserId: string;
    serviceId: string;
    description?: string;
    scheduledAt?: string | Date;
    addressText?: string;
    latitude: number;
    longitude: number;
    matchingRevision?: number;
    status?: string;
    biddingClosesAt?: string;
    selectionExpiresAt?: string;
  }): Promise<MatchingPrisma.ServiceRequestProjection> {
    const existing = await this.prisma.serviceRequestProjection.findUnique({
      where: { id: data.id },
      select: { biddingClosesAt: true },
    });

    const publishedClosesAt = data.biddingClosesAt
      ? new Date(data.biddingClosesAt)
      : null;
    const finalBiddingClosesAt =
      existing?.biddingClosesAt &&
      publishedClosesAt &&
      existing.biddingClosesAt > publishedClosesAt
        ? existing.biddingClosesAt
        : publishedClosesAt;

    const metadata = {
      requestCode: data.requestCode,
      customerUserId: data.customerUserId,
      serviceId: data.serviceId,
      description: data.description ?? null,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      addressText: data.addressText ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      biddingClosesAt: finalBiddingClosesAt,
      selectionExpiresAt: data.selectionExpiresAt
        ? new Date(data.selectionExpiresAt)
        : null,
      matchingRevision: data.matchingRevision ?? 1,
    };

    // INSERT ... ON CONFLICT DO NOTHING arbitrates concurrent publish/terminal
    // deliveries in PostgreSQL. Neither path can fail with an ID uniqueness race.
    await this.prisma.serviceRequestProjection.createMany({
      data: {
        id: data.id,
        ...metadata,
        status: data.status || 'open_for_bidding',
      },
      skipDuplicates: true,
    });
    // Only fill an unhydrated tombstone. Never overwrite later input revisions,
    // and never write status from a delayed publication. The predicate is checked
    // atomically even if another publisher or lifecycle event wins the race.
    await this.prisma.serviceRequestProjection.updateMany({
      where: { id: data.id, requestCode: 'TOMBSTONE', matchingRevision: 0 },
      data: metadata,
    });
    return this.prisma.serviceRequestProjection.findUniqueOrThrow({
      where: { id: data.id },
    });
  }

  /**
   * Updates projection inputs when request details change.
   */
  async updateMatchingInputs(data: {
    id: string;
    matchingRevision: number;
    serviceId?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<void> {
    const existing = await this.prisma.serviceRequestProjection.findUnique({
      where: { id: data.id },
    });

    if (!existing || existing.requestCode === 'TOMBSTONE')
      throw new Error('Request projection not yet available');
    await this.prisma.serviceRequestProjection.updateMany({
      where: {
        id: data.id,
        matchingRevision: { lt: data.matchingRevision },
        status: { in: ['open_for_bidding', 'bidding_closed'] },
      },
      data: {
        matchingRevision: data.matchingRevision,
        ...(data.serviceId ? { serviceId: data.serviceId } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
        ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Updates request status (e.g. cancelled, converted_to_order).
   * PR42-02: If projection does not exist yet when a terminal event arrives (out-of-order broker queues),
   * creates a durable tombstone to prevent late published events from resurrecting this request.
   */
  async updateRequestStatus(id: string, status: string): Promise<void> {
    if (
      ![
        'bidding_closed',
        'expired',
        'cancelled',
        'converted_to_order',
      ].includes(status)
    ) {
      throw new Error(`Unsupported request lifecycle status: ${status}`);
    }
    // Persist the terminal observation even when publication has not arrived.
    // A concurrent publisher may insert first; the conditional transition below
    // then closes its row. A concurrent terminal event cannot be overwritten.
    await this.prisma.serviceRequestProjection.createMany({
      data: {
        id,
        requestCode: 'TOMBSTONE',
        customerUserId: '00000000-0000-0000-0000-000000000000',
        serviceId: '00000000-0000-0000-0000-000000000000',
        latitude: 0,
        longitude: 0,
        status,
        matchingRevision: 0,
      },
      skipDuplicates: true,
    });

    const predecessors =
      status === 'bidding_closed'
        ? ['open_for_bidding']
        : ['open_for_bidding', 'bidding_closed'];
    await this.prisma.serviceRequestProjection.updateMany({
      where: { id, status: { in: predecessors } },
      data: { status },
    });
  }

  /**
   * FIX-02: Extends bidding deadline for anti-sniping consistency.
   * - Monotonic update: only updates if newClosesAt > current biddingClosesAt.
   * - Handles out-of-order events: creates a placeholder if published event hasn't arrived yet.
   * - Strictly preserves terminal statuses: never reopens cancelled, expired, converted_to_order, or bidding_closed.
   */
  async extendBiddingDeadline(
    id: string,
    newClosesAt: Date | string,
  ): Promise<void> {
    const newClosesAtDate =
      typeof newClosesAt === 'string' ? new Date(newClosesAt) : newClosesAt;

    if (Number.isNaN(newClosesAtDate.getTime())) {
      throw new Error(`Invalid newClosesAt date: ${String(newClosesAt)}`);
    }

    // Out-of-order handling: if publication has not arrived yet, insert placeholder.
    // If a row already exists (terminal tombstone or published), skipDuplicates avoids conflict.
    await this.prisma.serviceRequestProjection.createMany({
      data: {
        id,
        requestCode: 'TOMBSTONE',
        customerUserId: '00000000-0000-0000-0000-000000000000',
        serviceId: '00000000-0000-0000-0000-000000000000',
        latitude: 0,
        longitude: 0,
        status: 'open_for_bidding',
        matchingRevision: 0,
        biddingClosesAt: newClosesAtDate,
      },
      skipDuplicates: true,
    });

    // Monotonic update on open_for_bidding requests only:
    // Never updates cancelled, expired, converted_to_order, or bidding_closed
    // Never decreases biddingClosesAt if an older/duplicate event arrives
    await this.prisma.serviceRequestProjection.updateMany({
      where: {
        id,
        status: 'open_for_bidding',
        OR: [
          { biddingClosesAt: null },
          { biddingClosesAt: { lt: newClosesAtDate } },
        ],
      },
      data: {
        biddingClosesAt: newClosesAtDate,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Retrieves a single projection by ID.
   */
  async getProjection(
    id: string,
  ): Promise<MatchingPrisma.ServiceRequestProjection | null> {
    const projection = await this.prisma.serviceRequestProjection.findUnique({
      where: { id },
    });
    if (
      !projection ||
      !['open_for_bidding', 'bidding_closed'].includes(projection.status)
    )
      return projection;
    const now = Date.now();
    if (
      projection.selectionExpiresAt &&
      projection.selectionExpiresAt.getTime() <= now
    ) {
      return { ...projection, status: 'expired' };
    }
    if (
      projection.biddingClosesAt &&
      projection.biddingClosesAt.getTime() <= now
    ) {
      return { ...projection, status: 'bidding_closed' };
    }
    return projection;
  }

  /**
   * Worker job discovery: queries open requests matching the worker's offered services
   * and within at least one of the worker's active geographical service areas.
   * PR42-01: Uses matching_service.service_request_projections as the sole read model,
   * without cross-service database JOINs to order_service or bidding_service.
   */
  async findMatchingRequestsForWorker(params: {
    workerUserId: string;
    serviceIds: string[];
    serviceAreas: Array<{
      latitude: number;
      longitude: number;
      radiusKm: number;
    }>;
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<
      MatchingPrisma.ServiceRequestProjection & { distanceKm: number }
    >;
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      workerUserId,
      serviceIds,
      serviceAreas,
      page = 1,
      limit = 10,
    } = params;

    if (serviceIds.length === 0 || serviceAreas.length === 0) {
      return { items: [], total: 0, page, limit };
    }

    if (
      serviceAreas.some(
        (a) =>
          !Number.isFinite(a.latitude) ||
          !Number.isFinite(a.longitude) ||
          !Number.isFinite(a.radiusKm) ||
          a.radiusKm <= 0,
      )
    ) {
      throw new Error('Invalid worker service area');
    }
    const table = MatchingPrisma.Prisma.raw(
      `"${this.prisma.schema.replaceAll('"', '""')}"."service_request_projections"`,
    );
    const areas = JSON.stringify(serviceAreas);
    const [result] = await this.prisma.$queryRaw<
      Array<{
        total: number;
        items: Array<{ id: string; distance: number }>;
      }>
    >(MatchingPrisma.Prisma.sql`
      WITH nearby AS (
        SELECT p.id, p.created_at, MIN(6371 * 2 * asin(sqrt(LEAST(1.0, GREATEST(0.0,
          power(sin(radians(p.latitude::float8 - a.latitude) / 2), 2) +
          cos(radians(p.latitude::float8)) * cos(radians(a.latitude)) *
          power(sin(radians(p.longitude::float8 - a.longitude) / 2), 2)
        ))))) AS distance
        FROM ${table} p
        CROSS JOIN jsonb_to_recordset(${areas}::jsonb) AS a(latitude float8, longitude float8, "radiusKm" float8)
        WHERE p.service_id IN (${MatchingPrisma.Prisma.join(serviceIds.map((id) => MatchingPrisma.Prisma.sql`${id}::uuid`))})
          AND p.status = 'open_for_bidding'
          AND (p.bidding_closes_at IS NULL OR p.bidding_closes_at > clock_timestamp())
          AND (p.selection_expires_at IS NULL OR p.selection_expires_at > clock_timestamp())
          AND p.customer_user_id <> ${workerUserId}::uuid
          AND 6371 * 2 * asin(sqrt(LEAST(1.0, GREATEST(0.0,
            power(sin(radians(p.latitude::float8 - a.latitude) / 2), 2) +
            cos(radians(p.latitude::float8)) * cos(radians(a.latitude)) *
            power(sin(radians(p.longitude::float8 - a.longitude) / 2), 2)
          )))) <= a."radiusKm"
        GROUP BY p.id, p.created_at
      ), page AS (
        SELECT id, distance FROM nearby ORDER BY created_at DESC, id
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      )
      SELECT (SELECT count(*)::int FROM nearby) AS total,
        COALESCE((SELECT jsonb_agg(page) FROM page), '[]'::jsonb) AS items
    `);
    const records = await this.prisma.serviceRequestProjection.findMany({
      where: {
        id: { in: result.items.map((i) => i.id) },
        status: 'open_for_bidding',
      },
    });
    const byId = new Map(records.map((record) => [record.id, record]));
    return {
      total: result.total,
      page,
      limit,
      items: result.items.flatMap((item) => {
        const record = byId.get(item.id);
        return record
          ? [{ ...record, distanceKm: Math.round(item.distance * 100) / 100 }]
          : [];
      }),
    };
  }
}
