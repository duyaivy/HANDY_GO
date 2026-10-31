import { Injectable, Logger } from '@nestjs/common';
import { MatchingPrismaService, MatchingPrisma } from '@app/database';

@Injectable()
export class ServiceRequestProjectionService {
  private readonly logger = new Logger(ServiceRequestProjectionService.name);

  constructor(private readonly prisma: MatchingPrismaService) {}

  /**
   * Upserts the projection when a service request is published.
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
    const scheduledAtDate = data.scheduledAt
      ? new Date(data.scheduledAt)
      : null;

    return this.prisma.serviceRequestProjection.upsert({
      where: { id: data.id },
      update: {}, // A replay must never reopen or roll back an existing projection.
      create: {
        biddingClosesAt: data.biddingClosesAt
          ? new Date(data.biddingClosesAt)
          : null,
        selectionExpiresAt: data.selectionExpiresAt
          ? new Date(data.selectionExpiresAt)
          : null,
        id: data.id,
        requestCode: data.requestCode,
        customerUserId: data.customerUserId,
        serviceId: data.serviceId,
        description: data.description,
        scheduledAt: scheduledAtDate,
        addressText: data.addressText,
        latitude: data.latitude,
        longitude: data.longitude,
        status: data.status || 'open_for_bidding',
        matchingRevision: data.matchingRevision ?? 1,
      },
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

    if (!existing) throw new Error('Request projection not yet available');
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
        ...(data.longitude !== undefined
          ? { longitude: data.longitude }
          : {}),
        updatedAt: new Date(),
      },
    });

  }

  /**
   * Updates request status (e.g. cancelled, converted_to_order).
   */
  async updateRequestStatus(id: string, status: string): Promise<void> {
    const existing = await this.prisma.serviceRequestProjection.findUnique({
      where: { id },
    });

    if (!existing) {
      this.logger.warn(
        `Request projection ${id} not found when updating status to ${status}`,
      );
      return;
    }
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
        LEFT JOIN bidding_service.bidding_rounds b ON b.service_request_id = p.id
        LEFT JOIN order_service.service_requests o ON o.id = p.id
        WHERE p.service_id IN (${MatchingPrisma.Prisma.join(serviceIds.map((id) => MatchingPrisma.Prisma.sql`${id}::uuid`))})
          AND p.status = 'open_for_bidding'
          AND (p.bidding_closes_at IS NULL OR p.bidding_closes_at > clock_timestamp())
          AND (p.selection_expires_at IS NULL OR p.selection_expires_at > clock_timestamp())
          AND p.customer_user_id <> ${workerUserId}::uuid
          AND (b.id IS NULL OR (b.status = 'open' AND b.closes_at > clock_timestamp()))
          AND (o.id IS NULL OR (o.status = 'open_for_bidding' AND (o.bidding_closes_at IS NULL OR o.bidding_closes_at > clock_timestamp())))
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
