import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import {
  BookingProposalStatus,
  RequestStatus,
  WorkerSelectionSource,
  type Prisma,
} from '@prisma/order-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProposalSourceVerifierService } from './services/proposal-source-verifier.service.js';
import { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import {
  ORDER_ERROR_CODES,
  ORDER_ERROR_MESSAGES,
} from '../common/constants/order-errors.js';
import { CreateBookingProposalDto } from './dto/create-booking-proposal.dto.js';
import { RequestChangesProposalDto } from './dto/request-changes-proposal.dto.js';
import { RejectProposalDto } from './dto/reject-proposal.dto.js';
import { QueryBookingProposalDto } from './dto/query-booking-proposal.dto.js';

@Injectable()
export class BookingProposalsService {
  private readonly logger = new Logger(BookingProposalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalSourceVerifier: ProposalSourceVerifierService,
    private readonly outboxRepo: OrderOutboxRepository,
  ) {}

  /**
   * Create a new booking proposal or a subsequent immutable revision.
   */
  async create(userId: string, dto: CreateBookingProposalDto) {
    if (dto.autoAccept) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'autoAccept=true is not supported. Booking proposals must be accepted by the assigned worker.',
      );
    }

    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: dto.serviceRequestId },
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

    // Must be in open_for_bidding or bidding_closed
    if (
      request.status !== RequestStatus.open_for_bidding &&
      request.status !== RequestStatus.bidding_closed
    ) {
      if (request.status === RequestStatus.converted_to_order) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ORDER_ERROR_CODES.ORDER_ALREADY_EXISTS,
          'Service request has already been converted to an order',
        );
      }
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Cannot create proposals for service request in ${request.status} status`,
      );
    }

    // Check selection deadline expiration
    const now = new Date();
    if (request.selectionExpiresAt && request.selectionExpiresAt <= now) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.DEADLINE_EXPIRED,
        'The selection window for this service request has expired',
      );
    }

    // BE-10: Strict XOR selection source validation
    if (!dto.selectionSource) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'selectionSource is required',
      );
    }

    const hasBid = Boolean(dto.sourceBidId);
    const hasRecommendation = Boolean(dto.sourceMatchResultId);

    if (hasBid && hasRecommendation) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Both sourceBidId and sourceMatchResultId were provided; exactly one selection source is required',
      );
    }

    if (!hasBid && !hasRecommendation) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Either sourceBidId or sourceMatchResultId must be provided',
      );
    }

    if (dto.selectionSource === WorkerSelectionSource.bid) {
      if (!hasBid || hasRecommendation) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'selectionSource is bid: sourceBidId is required and sourceMatchResultId must not be provided',
        );
      }
    } else if (dto.selectionSource === WorkerSelectionSource.recommendation) {
      if (!hasRecommendation || hasBid) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'selectionSource is recommendation: sourceMatchResultId is required and sourceBidId must not be provided',
        );
      }
    } else {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Unsupported selectionSource: ${dto.selectionSource}`,
      );
    }

    // Verify source authenticity with external verifier (fail-closed)
    await this.proposalSourceVerifier.verifyProposalSource({
      selectionSource: dto.selectionSource,
      serviceRequestId: dto.serviceRequestId,
      workerUserId: dto.workerUserId,
      sourceBidId: dto.sourceBidId,
      sourceMatchResultId: dto.sourceMatchResultId,
    });

    return this.prisma.$transaction(async (tx) => {
      // Hierarchical lock on service request
      await tx.$executeRaw`
        SELECT id FROM order_service.service_requests
        WHERE id = ${dto.serviceRequestId}::uuid
        FOR UPDATE;
      `;

      const txRequest = await tx.serviceRequest.findUniqueOrThrow({
        where: { id: dto.serviceRequestId },
      });

      if (
        txRequest.status !== RequestStatus.open_for_bidding &&
        txRequest.status !== RequestStatus.bidding_closed
      ) {
        if (txRequest.status === RequestStatus.converted_to_order) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ORDER_ERROR_CODES.ORDER_ALREADY_EXISTS,
            'Service request has already been converted to an order',
          );
        }
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          `Cannot create proposals for service request in ${txRequest.status} status`,
        );
      }

      if (txRequest.selectionExpiresAt && txRequest.selectionExpiresAt <= new Date()) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.DEADLINE_EXPIRED,
          'The selection window for this service request has expired',
        );
      }

      let revisionNo = 1;
      let supersedesProposalId: string | null = null;

      if (dto.supersedesProposalId) {
        // Lock old proposal
        await tx.$executeRaw`
          SELECT id FROM order_service.booking_proposals
          WHERE id = ${dto.supersedesProposalId}::uuid
          FOR UPDATE;
        `;

        const oldProposal = await tx.bookingProposal.findUnique({
          where: { id: dto.supersedesProposalId },
          include: { supersededBy: true },
        });

        if (!oldProposal) {
          throw new AppException(
            HttpStatus.NOT_FOUND,
            ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
            'Previous proposal revision not found',
          );
        }

        if (oldProposal.serviceRequestId !== dto.serviceRequestId) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ORDER_ERROR_CODES.PROPOSAL_REVISION_CONFLICT,
            'Superseded proposal does not belong to the same service request',
          );
        }

        if (oldProposal.workerUserId !== dto.workerUserId) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ORDER_ERROR_CODES.PROPOSAL_REVISION_CONFLICT,
            'Superseded proposal does not belong to the specified worker',
          );
        }

        if (oldProposal.status !== BookingProposalStatus.changes_requested) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ORDER_ERROR_CODES.PROPOSAL_REVISION_CONFLICT,
            `Cannot create a revision for a proposal in ${oldProposal.status} status. It must be changes_requested.`,
          );
        }

        if (oldProposal.supersededBy) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ORDER_ERROR_CODES.PROPOSAL_REVISION_CONFLICT,
            'A newer revision has already superseded this proposal',
          );
        }

        revisionNo = oldProposal.revisionNo + 1;
        supersedesProposalId = oldProposal.id;
      } else {
        const existingProposed = await tx.bookingProposal.findFirst({
          where: {
            serviceRequestId: dto.serviceRequestId,
            workerUserId: dto.workerUserId,
            status: BookingProposalStatus.proposed,
          },
        });

        if (existingProposed) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ORDER_ERROR_CODES.PROPOSAL_REVISION_CONFLICT,
            'An active proposal is already awaiting response from this worker. Withdraw or await response first.',
          );
        }
      }

      // Determine expiration date
      const maxExpiresAt =
        txRequest.selectionExpiresAt ??
        new Date(now.getTime() + 24 * 3600 * 1000);

      let expiresAt = maxExpiresAt;
      if (dto.expiresAt) {
        const requestedExpiry = new Date(dto.expiresAt);
        if (requestedExpiry <= now) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ORDER_ERROR_CODES.DEADLINE_EXPIRED,
            'Proposal expiresAt must be in the future',
          );
        }
        if (requestedExpiry > maxExpiresAt) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ORDER_ERROR_CODES.DEADLINE_EXPIRED,
            `Proposal expiresAt cannot exceed the request selection deadline (${maxExpiresAt.toISOString()})`,
          );
        }
        expiresAt = requestedExpiry;
      }

      const created = await tx.bookingProposal.create({
        data: {
          serviceRequestId: dto.serviceRequestId,
          supersedesProposalId,
          revisionNo,
          customerUserId: userId,
          workerUserId: dto.workerUserId,
          selectionSource: dto.selectionSource,
          sourceBidId: dto.sourceBidId ?? null,
          sourceMatchResultId: dto.sourceMatchResultId ?? null,
          agreedPrice: dto.agreedPrice,
          agreedScope: dto.agreedScope,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          status: BookingProposalStatus.proposed,
          expiresAt,
        },
        include: {
          serviceRequest: {
            select: {
              id: true,
              requestCode: true,
              status: true,
            },
          },
          supersedesProposal: {
            select: {
              id: true,
              revisionNo: true,
              status: true,
              responseNote: true,
            },
          },
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_BOOKING_PROPOSAL,
          aggregateId: created.id,
          eventType: ORDER_CONSTANTS.EVENT_BOOKING_PROPOSAL_CREATED,
          eventVersion: 1,
          payload: {
            proposalId: created.id,
            requestId: created.serviceRequestId,
            serviceRequestId: created.serviceRequestId,
            customerId: userId,
            customerUserId: userId,
            workerId: dto.workerUserId,
            workerUserId: dto.workerUserId,
            revisionNo: created.revisionNo,
            agreedPrice: created.agreedPrice.toString(),
            scheduledAt: created.scheduledAt ? new Date(created.scheduledAt).toISOString() : null,
            createdAt: (created.createdAt ? new Date(created.createdAt) : new Date()).toISOString(),
          },
        },
        tx,
      );

      this.logger.log(
        `Created booking proposal: ${created.id} (Revision ${created.revisionNo}) for worker ${dto.workerUserId} on request ${dto.serviceRequestId}`,
      );
      return created;
    });
  }

  /**
   * List proposals with filters and pagination.
   */
  async findAll(
    userId: string,
    query: QueryBookingProposalDto,
    roles: string[] = [],
  ) {
    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');

    const where: Prisma.BookingProposalWhereInput = {
      ...(query.serviceRequestId
        ? { serviceRequestId: query.serviceRequestId }
        : {}),
      ...(isAdmin
        ? {
            ...(query.workerUserId ? { workerUserId: query.workerUserId } : {}),
            ...(query.customerUserId
              ? { customerUserId: query.customerUserId }
              : {}),
          }
        : {
            OR: [{ customerUserId: userId }, { workerUserId: userId }],
            ...(query.workerUserId ? { workerUserId: query.workerUserId } : {}),
            ...(query.customerUserId
              ? { customerUserId: query.customerUserId }
              : {}),
          }),
    };

    if (typeof query.status === 'string' && query.status.trim().length > 0) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 1) {
        where.status = { in: statuses as BookingProposalStatus[] };
      } else if (statuses.length === 1) {
        where.status = statuses[0] as BookingProposalStatus;
      }
    }

    const skip = (query.page - 1) * query.limit;
    const take = query.limit;

    const [total, items] = await Promise.all([
      this.prisma.bookingProposal.count({ where }),
      this.prisma.bookingProposal.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          serviceRequest: {
            select: {
              id: true,
              requestCode: true,
              status: true,
            },
          },
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
   * List proposals received by the current worker.
   */
  async findMyReceivedProposals(
    workerUserId: string,
    query: QueryBookingProposalDto,
  ) {
    const where: Prisma.BookingProposalWhereInput = {
      workerUserId,
      ...(query.serviceRequestId
        ? { serviceRequestId: query.serviceRequestId }
        : {}),
    };

    if (typeof query.status === 'string' && query.status.trim().length > 0) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 1) {
        where.status = { in: statuses as BookingProposalStatus[] };
      } else if (statuses.length === 1) {
        where.status = statuses[0] as BookingProposalStatus;
      }
    }

    const skip = (query.page - 1) * query.limit;
    const take = query.limit;

    const [total, items] = await Promise.all([
      this.prisma.bookingProposal.count({ where }),
      this.prisma.bookingProposal.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          serviceRequest: {
            select: {
              id: true,
              requestCode: true,
              status: true,
              addressText: true,
            },
          },
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
   * Get single proposal by ID with access control.
   */
  async findById(id: string, userId: string, roles: string[] = []) {
    const proposal = await this.prisma.bookingProposal.findUnique({
      where: { id },
      include: {
        serviceRequest: true,
        supersedesProposal: true,
        supersededBy: true,
      },
    });

    if (!proposal) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
      );
    }

    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
    const isParticipant =
      proposal.customerUserId === userId || proposal.workerUserId === userId;

    if (!isParticipant && !isAdmin) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ORDER_ERROR_CODES.NOT_PROPOSAL_PARTICIPANT,
        ORDER_ERROR_MESSAGES.NOT_PROPOSAL_PARTICIPANT,
      );
    }

    return proposal;
  }

  /**
   * Get all proposals under a specific service request.
   */
  async findByServiceRequestId(
    serviceRequestId: string,
    userId: string,
    roles: string[] = [],
  ) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
    });

    if (!request) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      );
    }

    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
    const isOwner = request.customerUserId === userId;
    const isWorker = roles.some((r) => r.toLowerCase() === 'worker');

    if (!isOwner && !isAdmin) {
      if (!isWorker) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ORDER_ERROR_CODES.FORBIDDEN_ROLE,
          'You are not authorized to view proposals for this request',
        );
      }
    }

    const proposals = await this.prisma.bookingProposal.findMany({
      where: { serviceRequestId },
      orderBy: [{ revisionNo: 'desc' }, { createdAt: 'desc' }],
      include: {
        supersedesProposal: {
          select: {
            id: true,
            revisionNo: true,
            status: true,
            responseNote: true,
          },
        },
      },
    });

    if (!isOwner && !isAdmin) {
      // Worker can only see proposals involving themselves
      return proposals.filter((p) => p.workerUserId === userId);
    }

    return proposals;
  }

  /**
   * Worker requests changes on terms (ORD-05).
   * Transitions status from `proposed` -> `changes_requested`.
   */
  async requestChanges(
    id: string,
    workerUserId: string,
    dto: RequestChangesProposalDto,
  ) {
    const existing = await this.prisma.bookingProposal.findUnique({
      where: { id },
      select: { id: true, serviceRequestId: true },
    });

    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Hierarchical locking: ServiceRequest -> BookingProposal
      await tx.$executeRaw`
        SELECT id FROM order_service.service_requests
        WHERE id = ${existing.serviceRequestId}::uuid
        FOR UPDATE;
      `;
      await tx.$executeRaw`
        SELECT id FROM order_service.booking_proposals
        WHERE id = ${id}::uuid
        FOR UPDATE;
      `;

      const [request, proposal] = await Promise.all([
        tx.serviceRequest.findUniqueOrThrow({
          where: { id: existing.serviceRequestId },
        }),
        tx.bookingProposal.findUniqueOrThrow({
          where: { id },
        }),
      ]);

      if (request.status === RequestStatus.converted_to_order) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'Service request has already been converted to an order',
        );
      }

      if (proposal.workerUserId !== workerUserId) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ORDER_ERROR_CODES.NOT_PROPOSAL_PARTICIPANT,
          'Only the assigned worker can request changes to this proposal',
        );
      }

      if (proposal.status !== BookingProposalStatus.proposed) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          `Cannot request changes on a proposal in ${proposal.status} status`,
        );
      }

      const now = new Date();
      if (proposal.expiresAt <= now) {
        await tx.bookingProposal.updateMany({
          where: { id, status: BookingProposalStatus.proposed },
          data: { status: BookingProposalStatus.expired },
        });
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.DEADLINE_EXPIRED,
          ORDER_ERROR_MESSAGES.DEADLINE_EXPIRED,
        );
      }

      const updateResult = await tx.bookingProposal.updateMany({
        where: { id, status: BookingProposalStatus.proposed },
        data: {
          status: BookingProposalStatus.changes_requested,
          responseNote: dto.responseNote,
          workerRespondedAt: now,
        },
      });

      if (updateResult.count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'Proposal status changed concurrently',
        );
      }

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_BOOKING_PROPOSAL,
          aggregateId: id,
          eventType: ORDER_CONSTANTS.EVENT_BOOKING_PROPOSAL_CHANGES_REQUESTED,
          eventVersion: 1,
          payload: {
            proposalId: id,
            requestId: existing.serviceRequestId,
            serviceRequestId: existing.serviceRequestId,
            customerId: proposal.customerUserId,
            customerUserId: proposal.customerUserId,
            workerId: workerUserId,
            workerUserId: workerUserId,
            revisionNo: proposal.revisionNo,
            responseNote: dto.responseNote,
            requestedAt: now.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(
        `Worker ${workerUserId} requested changes on proposal ${id}`,
      );

      return tx.bookingProposal.findUniqueOrThrow({
        where: { id },
      });
    });
  }

  /**
   * Worker rejects the booking proposal.
   * Transitions status from `proposed` -> `worker_rejected`.
   */
  async reject(id: string, workerUserId: string, dto?: RejectProposalDto) {
    const existing = await this.prisma.bookingProposal.findUnique({
      where: { id },
      select: { id: true, serviceRequestId: true },
    });

    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Hierarchical locking: ServiceRequest -> BookingProposal
      await tx.$executeRaw`
        SELECT id FROM order_service.service_requests
        WHERE id = ${existing.serviceRequestId}::uuid
        FOR UPDATE;
      `;
      await tx.$executeRaw`
        SELECT id FROM order_service.booking_proposals
        WHERE id = ${id}::uuid
        FOR UPDATE;
      `;

      const [request, proposal] = await Promise.all([
        tx.serviceRequest.findUniqueOrThrow({
          where: { id: existing.serviceRequestId },
        }),
        tx.bookingProposal.findUniqueOrThrow({
          where: { id },
        }),
      ]);

      if (request.status === RequestStatus.converted_to_order) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'Service request has already been converted to an order',
        );
      }

      if (proposal.workerUserId !== workerUserId) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ORDER_ERROR_CODES.NOT_PROPOSAL_PARTICIPANT,
          'Only the assigned worker can reject this proposal',
        );
      }

      if (proposal.status !== BookingProposalStatus.proposed) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          `Cannot reject a proposal in ${proposal.status} status`,
        );
      }

      const now = new Date();
      const updateResult = await tx.bookingProposal.updateMany({
        where: { id, status: BookingProposalStatus.proposed },
        data: {
          status: BookingProposalStatus.worker_rejected,
          responseNote: dto?.responseNote ?? null,
          workerRespondedAt: now,
        },
      });

      if (updateResult.count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'Proposal status changed concurrently',
        );
      }

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_BOOKING_PROPOSAL,
          aggregateId: id,
          eventType: ORDER_CONSTANTS.EVENT_BOOKING_PROPOSAL_REJECTED,
          eventVersion: 1,
          payload: {
            proposalId: id,
            requestId: existing.serviceRequestId,
            serviceRequestId: existing.serviceRequestId,
            customerId: proposal.customerUserId,
            customerUserId: proposal.customerUserId,
            workerId: workerUserId,
            workerUserId: workerUserId,
            revisionNo: proposal.revisionNo,
            responseNote: dto?.responseNote ?? null,
            rejectedAt: now.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(`Worker ${workerUserId} rejected proposal ${id}`);

      return tx.bookingProposal.findUniqueOrThrow({
        where: { id },
      });
    });
  }

  /**
   * Customer withdraws proposal before worker response.
   * Transitions status from `proposed` -> `withdrawn`.
   */
  async withdraw(id: string, customerUserId: string) {
    const existing = await this.prisma.bookingProposal.findUnique({
      where: { id },
      select: { id: true, serviceRequestId: true },
    });

    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Hierarchical locking: ServiceRequest -> BookingProposal
      await tx.$executeRaw`
        SELECT id FROM order_service.service_requests
        WHERE id = ${existing.serviceRequestId}::uuid
        FOR UPDATE;
      `;
      await tx.$executeRaw`
        SELECT id FROM order_service.booking_proposals
        WHERE id = ${id}::uuid
        FOR UPDATE;
      `;

      const [request, proposal] = await Promise.all([
        tx.serviceRequest.findUniqueOrThrow({
          where: { id: existing.serviceRequestId },
        }),
        tx.bookingProposal.findUniqueOrThrow({
          where: { id },
        }),
      ]);

      if (request.status === RequestStatus.converted_to_order) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'Service request has already been converted to an order',
        );
      }

      if (proposal.customerUserId !== customerUserId) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ORDER_ERROR_CODES.NOT_REQUEST_OWNER,
          'Only the customer who created this proposal can withdraw it',
        );
      }

      if (proposal.status !== BookingProposalStatus.proposed) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          `Cannot withdraw a proposal that is already ${proposal.status}`,
        );
      }

      const updateResult = await tx.bookingProposal.updateMany({
        where: { id, status: BookingProposalStatus.proposed },
        data: {
          status: BookingProposalStatus.withdrawn,
        },
      });

      if (updateResult.count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          'Proposal status changed concurrently',
        );
      }

      this.logger.log(`Customer ${customerUserId} withdrew proposal ${id}`);

      return tx.bookingProposal.findUniqueOrThrow({
        where: { id },
      });
    });
  }
}

