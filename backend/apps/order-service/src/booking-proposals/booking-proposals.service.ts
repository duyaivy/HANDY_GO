import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import {
  BookingProposalStatus,
  RequestStatus,
  WorkerSelectionSource,
  type Prisma,
} from '@prisma/order-client';
import { PrismaService } from '../prisma/prisma.service.js';
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new booking proposal or a subsequent immutable revision.
   */
  async create(userId: string, dto: CreateBookingProposalDto) {
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

    // XOR selection source validation
    if (
      dto.selectionSource === WorkerSelectionSource.bid &&
      !dto.sourceBidId
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'sourceBidId is required when selectionSource is bid',
      );
    }

    if (
      dto.selectionSource === WorkerSelectionSource.recommendation &&
      !dto.sourceMatchResultId
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'sourceMatchResultId is required when selectionSource is recommendation',
      );
    }

    let revisionNo = 1;
    let supersedesProposalId: string | null = null;

    if (dto.supersedesProposalId) {
      const oldProposal = await this.prisma.bookingProposal.findUnique({
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
      // Check if there is already an active proposed proposal for this worker on this request
      const existingProposed = await this.prisma.bookingProposal.findFirst({
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
      request.selectionExpiresAt ??
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

    const created = await this.prisma.bookingProposal.create({
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

    this.logger.log(
      `Created booking proposal: ${created.id} (Revision ${created.revisionNo}) for worker ${dto.workerUserId} on request ${dto.serviceRequestId}`,
    );
    return created;
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
      ...(query.status ? { status: query.status } : {}),
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
      ...(query.status ? { status: query.status } : {}),
    };

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
    const proposal = await this.prisma.bookingProposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
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
      await this.prisma.bookingProposal.update({
        where: { id },
        data: { status: BookingProposalStatus.expired },
      });
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.DEADLINE_EXPIRED,
        ORDER_ERROR_MESSAGES.DEADLINE_EXPIRED,
      );
    }

    const updated = await this.prisma.bookingProposal.update({
      where: { id },
      data: {
        status: BookingProposalStatus.changes_requested,
        responseNote: dto.responseNote,
        workerRespondedAt: now,
      },
    });

    this.logger.log(
      `Worker ${workerUserId} requested changes on proposal ${id}`,
    );
    return updated;
  }

  /**
   * Worker rejects the booking proposal.
   * Transitions status from `proposed` -> `worker_rejected`.
   */
  async reject(id: string, workerUserId: string, dto?: RejectProposalDto) {
    const proposal = await this.prisma.bookingProposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
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
    const updated = await this.prisma.bookingProposal.update({
      where: { id },
      data: {
        status: BookingProposalStatus.worker_rejected,
        responseNote: dto?.responseNote ?? null,
        workerRespondedAt: now,
      },
    });

    this.logger.log(`Worker ${workerUserId} rejected proposal ${id}`);
    return updated;
  }

  /**
   * Customer withdraws proposal before worker response.
   * Transitions status from `proposed` -> `withdrawn`.
   */
  async withdraw(id: string, customerUserId: string) {
    const proposal = await this.prisma.bookingProposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
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

    const updated = await this.prisma.bookingProposal.update({
      where: { id },
      data: {
        status: BookingProposalStatus.withdrawn,
      },
    });

    this.logger.log(`Customer ${customerUserId} withdrew proposal ${id}`);
    return updated;
  }
}
