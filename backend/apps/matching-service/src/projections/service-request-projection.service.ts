import { Injectable, Logger } from '@nestjs/common';
import { MatchingPrismaService, MatchingPrisma } from '@app/database';
import { calculateHaversineDistance } from '../eligibility/haversine.util.js';

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
  }): Promise<MatchingPrisma.ServiceRequestProjection> {
    const scheduledAtDate = data.scheduledAt ? new Date(data.scheduledAt) : null;

    return this.prisma.serviceRequestProjection.upsert({
      where: { id: data.id },
      update: {
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
        updatedAt: new Date(),
      },
      create: {
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

    if (existing) {
      await this.prisma.serviceRequestProjection.update({
        where: { id: data.id },
        data: {
          matchingRevision: data.matchingRevision,
          ...(data.serviceId ? { serviceId: data.serviceId } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
          ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Updates request status (e.g. cancelled, converted_to_order).
   */
  async updateRequestStatus(id: string, status: string): Promise<void> {
    const existing = await this.prisma.serviceRequestProjection.findUnique({
      where: { id },
    });

    if (existing) {
      await this.prisma.serviceRequestProjection.update({
        where: { id },
        data: {
          status,
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Retrieves a single projection by ID.
   */
  async getProjection(id: string): Promise<MatchingPrisma.ServiceRequestProjection | null> {
    return this.prisma.serviceRequestProjection.findUnique({
      where: { id },
    });
  }

  /**
   * Worker job discovery: queries open requests matching the worker's offered services
   * and within at least one of the worker's active geographical service areas.
   */
  async findMatchingRequestsForWorker(params: {
    workerUserId: string;
    serviceIds: string[];
    serviceAreas: Array<{ latitude: number; longitude: number; radiusKm: number }>;
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<MatchingPrisma.ServiceRequestProjection & { distanceKm: number }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const { workerUserId, serviceIds, serviceAreas, page = 1, limit = 10 } = params;

    if (serviceIds.length === 0 || serviceAreas.length === 0) {
      return { items: [], total: 0, page, limit };
    }

    // 1. Fetch candidate open requests matching service IDs
    const openRequests = await this.prisma.serviceRequestProjection.findMany({
      where: {
        serviceId: { in: serviceIds },
        status: 'open_for_bidding',
        customerUserId: { not: workerUserId }, // Anti-self-matching
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Geographically filter candidates using worker's service areas
    const matchedItems: Array<
      MatchingPrisma.ServiceRequestProjection & { distanceKm: number }
    > = [];

    for (const req of openRequests) {
      const reqLat = Number(req.latitude);
      const reqLon = Number(req.longitude);

      let minDistance = Infinity;

      for (const area of serviceAreas) {
        try {
          const dist = calculateHaversineDistance(
            reqLat,
            reqLon,
            area.latitude,
            area.longitude,
          );
          if (dist <= area.radiusKm && dist < minDistance) {
            minDistance = dist;
          }
        } catch {
          // ignore coordinate calculation error
        }
      }

      if (minDistance !== Infinity) {
        matchedItems.push({
          ...req,
          distanceKm: Math.round(minDistance * 100) / 100,
        });
      }
    }

    // 3. Paginate
    const total = matchedItems.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = matchedItems.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
    };
  }
}
