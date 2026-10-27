import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import {
  BookingProposalStatus,
  RequestStatus,
  type Prisma,
} from '@prisma/order-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import {
  ORDER_ERROR_CODES,
  ORDER_ERROR_MESSAGES,
} from '../common/constants/order-errors.js';
import { generateRequestCode } from '../common/utils/code-generator.util.js';
import {
  CreateServiceRequestDto,
  ServiceRequestMediaDto,
} from './dto/create-service-request.dto.js';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto.js';
import { QueryServiceRequestDto } from './dto/query-service-request.dto.js';

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: OrderOutboxRepository,
  ) {}

  /**
   * Create a new service request in `draft` status.
   * If media links are provided, they are inserted in the same transaction.
   */
  async createDraft(userId: string, dto: CreateServiceRequestDto) {
    const requestCode = generateRequestCode();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceRequest.create({
        data: {
          requestCode,
          customerUserId: userId,
          serviceId: dto.serviceId ?? null,
          description: dto.description ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          aiRefPriceMin:
            dto.aiRefPriceMin !== undefined ? dto.aiRefPriceMin : null,
          aiRefPriceMax:
            dto.aiRefPriceMax !== undefined ? dto.aiRefPriceMax : null,
          addressText: dto.addressText ?? null,
          latitude: dto.latitude !== undefined ? dto.latitude : null,
          longitude: dto.longitude !== undefined ? dto.longitude : null,
          status: RequestStatus.draft,
          ...(dto.media && dto.media.length > 0
            ? {
                media: {
                  createMany: {
                    data: dto.media.map((m) => ({
                      mediaType: m.mediaType,
                      mediaUrl: m.mediaUrl,
                    })),
                  },
                },
              }
            : {}),
        },
        include: {
          media: true,
        },
      });

      this.logger.log(
        `Created draft service request: ${created.id} (${created.requestCode}) for user ${userId}`,
      );
      return created;
    });
  }

  /**
   * List service requests created by the authenticated customer.
   */
  async findAll(userId: string, query: QueryServiceRequestDto) {
    const where: Prisma.ServiceRequestWhereInput = {
      customerUserId: userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
    };

    const skip = (query.page - 1) * query.limit;
    const take = query.limit;

    const [total, items] = await Promise.all([
      this.prisma.serviceRequest.count({ where }),
      this.prisma.serviceRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          media: true,
        },
      }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  /**
   * Get single service request detail with access control:
   * - Customer owner or Admin can always view.
   * - Worker can view if published, bidding closed, or if worker participates in proposal/order.
   */
  async findById(id: string, userId: string, roles: string[] = []) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        media: true,
        bookingProposals: {
          select: {
            id: true,
            workerUserId: true,
            status: true,
            agreedPrice: true,
            revisionNo: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        order: {
          select: {
            id: true,
            orderCode: true,
            workerUserId: true,
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      );
    }

    const isOwner = request.customerUserId === userId;
    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
    const isWorker = roles.some((r) => r.toLowerCase() === 'worker');

    if (!isOwner && !isAdmin) {
      if (!isWorker) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ORDER_ERROR_CODES.FORBIDDEN_ROLE,
          'You are not authorized to view this service request',
        );
      }

      if (request.status === RequestStatus.draft) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ORDER_ERROR_CODES.NOT_REQUEST_OWNER,
          ORDER_ERROR_MESSAGES.NOT_REQUEST_OWNER,
        );
      }

      const isAssociatedWorker =
        request.bookingProposals.some((p) => p.workerUserId === userId) ||
        request.order?.workerUserId === userId;
      const isPubliclyAvailableForWorkers =
        request.status === RequestStatus.open_for_bidding ||
        request.status === RequestStatus.bidding_closed;

      if (!isPubliclyAvailableForWorkers && !isAssociatedWorker) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ORDER_ERROR_CODES.FORBIDDEN_ROLE,
          'You are not authorized to view this service request',
        );
      }

      // BE-12: Filter nested booking proposals so workers only see their own proposals
      return {
        ...request,
        bookingProposals: request.bookingProposals.filter(
          (p) => p.workerUserId === userId,
        ),
      };
    }

    return request;
  }

  /**
   * Update an existing draft request.
   * Only allowed when status is `draft` and user is owner.
   */
  async updateDraft(id: string, userId: string, dto: UpdateServiceRequestDto) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { media: true },
    });

    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      );
    }

    if (request.customerUserId !== userId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ORDER_ERROR_CODES.NOT_REQUEST_OWNER,
        ORDER_ERROR_MESSAGES.NOT_REQUEST_OWNER,
      );
    }

    if (request.status !== RequestStatus.draft) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Only draft service requests can be modified',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.media !== undefined) {
        await tx.requestMedia.deleteMany({
          where: { serviceRequestId: id },
        });

        if (dto.media.length > 0) {
          await tx.requestMedia.createMany({
            data: dto.media.map((m) => ({
              serviceRequestId: id,
              mediaType: m.mediaType,
              mediaUrl: m.mediaUrl,
            })),
          });
        }
      }

      const updated = await tx.serviceRequest.update({
        where: { id },
        data: {
          serviceId: dto.serviceId !== undefined ? dto.serviceId : undefined,
          description:
            dto.description !== undefined ? dto.description : undefined,
          scheduledAt:
            dto.scheduledAt !== undefined
              ? dto.scheduledAt
                ? new Date(dto.scheduledAt)
                : null
              : undefined,
          aiRefPriceMin:
            dto.aiRefPriceMin !== undefined ? dto.aiRefPriceMin : undefined,
          aiRefPriceMax:
            dto.aiRefPriceMax !== undefined ? dto.aiRefPriceMax : undefined,
          addressText:
            dto.addressText !== undefined ? dto.addressText : undefined,
          latitude: dto.latitude !== undefined ? dto.latitude : undefined,
          longitude: dto.longitude !== undefined ? dto.longitude : undefined,
          version: { increment: 1 },
        },
        include: {
          media: true,
        },
      });

      this.logger.log(`Updated draft service request: ${id}`);
      return updated;
    });
  }

  /**
   * Add a media link to draft service request (ORD-02).
   */
  async addMedia(id: string, userId: string, dto: ServiceRequestMediaDto) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      );
    }

    if (request.customerUserId !== userId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ORDER_ERROR_CODES.NOT_REQUEST_OWNER,
        ORDER_ERROR_MESSAGES.NOT_REQUEST_OWNER,
      );
    }

    if (request.status !== RequestStatus.draft) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Cannot add media to a request in ${request.status} status. Media can only be modified in draft status.`,
      );
    }

    const createdMedia = await this.prisma.requestMedia.create({
      data: {
        serviceRequestId: id,
        mediaType: dto.mediaType,
        mediaUrl: dto.mediaUrl,
      },
    });

    this.logger.log(`Added media ${createdMedia.id} to request ${id}`);
    return createdMedia;
  }

  /**
   * Delete a media item from draft service request (ORD-02).
   */
  async deleteMedia(id: string, mediaId: string, userId: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      );
    }

    if (request.customerUserId !== userId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ORDER_ERROR_CODES.NOT_REQUEST_OWNER,
        ORDER_ERROR_MESSAGES.NOT_REQUEST_OWNER,
      );
    }

    if (request.status !== RequestStatus.draft) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Cannot delete media from a request in ${request.status} status. Media can only be modified in draft status.`,
      );
    }

    const media = await this.prisma.requestMedia.findFirst({
      where: { id: mediaId, serviceRequestId: id },
    });

    if (!media) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.MEDIA_NOT_FOUND,
        ORDER_ERROR_MESSAGES.MEDIA_NOT_FOUND,
      );
    }

    await this.prisma.requestMedia.delete({
      where: { id: mediaId },
    });

    this.logger.log(`Deleted media ${mediaId} from request ${id}`);
  }

  /**
   * Publish a draft service request (ORD-03).
   * Validates mandatory fields and establishes 24h bidding deadline + 48h selection deadline.
   * Emits `service_request.published` event atomically via Outbox.
   */
  async publish(id: string, userId: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { media: true },
    });

    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      );
    }

    if (request.customerUserId !== userId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ORDER_ERROR_CODES.NOT_REQUEST_OWNER,
        ORDER_ERROR_MESSAGES.NOT_REQUEST_OWNER,
      );
    }

    if (request.status !== RequestStatus.draft) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Only draft service requests can be published',
      );
    }

    // Strict validation for publishing
    const missingFields: string[] = [];
    if (!request.serviceId) missingFields.push('serviceId');
    if (!request.addressText?.trim()) missingFields.push('addressText');
    if (request.latitude === null || request.latitude === undefined)
      missingFields.push('latitude');
    if (request.longitude === null || request.longitude === undefined)
      missingFields.push('longitude');
    if (!request.description?.trim()) missingFields.push('description');

    const CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;
    if (!request.scheduledAt) {
      missingFields.push('scheduledAt');
    } else if (new Date(request.scheduledAt).getTime() < Date.now() - CLOCK_SKEW_TOLERANCE_MS) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ORDER_ERROR_CODES.INCOMPLETE_PUBLISH_PAYLOAD,
        'Scheduled appointment time must be in the future',
        {
          fieldErrors: {
            scheduledAt: ['Scheduled appointment time must be in the future'],
          },
        },
      );
    }

    if (missingFields.length > 0) {
      const fieldErrors = missingFields.reduce<Record<string, string[]>>(
        (acc, field) => {
          acc[field] = [`Field ${field} is required`];
          return acc;
        },
        {},
      );
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ORDER_ERROR_CODES.INCOMPLETE_PUBLISH_PAYLOAD,
        `Cannot publish request missing required fields: ${missingFields.join(', ')}`,
        { fieldErrors },
      );
    }

    const now = new Date();
    const biddingClosesAt = new Date(
      now.getTime() +
        ORDER_CONSTANTS.DEFAULT_BIDDING_DURATION_HOURS * 3600 * 1000,
    );
    const selectionExpiresAt = new Date(
      biddingClosesAt.getTime() +
        ORDER_CONSTANTS.DEFAULT_SELECTION_DURATION_HOURS * 3600 * 1000,
    );

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.serviceRequest.update({
        where: { id },
        data: {
          status: RequestStatus.open_for_bidding,
          publishedAt: now,
          biddingClosesAt,
          selectionExpiresAt,
          version: { increment: 1 },
        },
        include: {
          media: true,
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
          aggregateId: published.id,
          eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_PUBLISHED,
          eventVersion: 1,
          payload: {
            requestId: published.id,
            requestCode: published.requestCode,
            customerUserId: published.customerUserId,
            serviceId: published.serviceId,
            description: published.description,
            scheduledAt: published.scheduledAt?.toISOString(),
            aiRefPriceMin: published.aiRefPriceMin?.toString() ?? null,
            aiRefPriceMax: published.aiRefPriceMax?.toString() ?? null,
            addressText: published.addressText,
            latitude: published.latitude?.toString() ?? null,
            longitude: published.longitude?.toString() ?? null,
            publishedAt: published.publishedAt?.toISOString(),
            biddingClosesAt: published.biddingClosesAt?.toISOString(),
            selectionExpiresAt: published.selectionExpiresAt?.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(
        `Published service request: ${id} (${published.requestCode}). Bidding closes at ${biddingClosesAt.toISOString()}`,
      );
      return published;
    });
  }

  /**
   * Cancel an open or draft request when no Order has been materialized.
   */
  async cancel(id: string, userId: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      );
    }

    if (request.customerUserId !== userId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ORDER_ERROR_CODES.NOT_REQUEST_OWNER,
        ORDER_ERROR_MESSAGES.NOT_REQUEST_OWNER,
      );
    }

    if (request.status === RequestStatus.converted_to_order) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Cannot cancel a request that has already been converted to an order',
      );
    }

    if (
      request.status === RequestStatus.cancelled ||
      request.status === RequestStatus.expired
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Service request is already cancelled or expired',
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Transition open proposed proposals to withdrawn
      await tx.bookingProposal.updateMany({
        where: {
          serviceRequestId: id,
          status: BookingProposalStatus.proposed,
        },
        data: {
          status: BookingProposalStatus.withdrawn,
        },
      });

      const cancelled = await tx.serviceRequest.update({
        where: { id },
        data: {
          status: RequestStatus.cancelled,
          version: { increment: 1 },
        },
        include: {
          media: true,
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
          aggregateId: cancelled.id,
          eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_CANCELLED,
          eventVersion: 1,
          payload: {
            requestId: cancelled.id,
            requestCode: cancelled.requestCode,
            customerUserId: cancelled.customerUserId,
            cancelledAt: now.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(`Cancelled service request: ${id}`);
      return cancelled;
    });
  }
}
