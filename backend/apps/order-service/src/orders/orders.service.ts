import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/order-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { generateOrderCode } from '../common/utils/code-generator.util.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import {
  ORDER_ERROR_CODES,
  ORDER_ERROR_MESSAGES,
} from '../common/constants/order-errors.js';
import type { QueryOrderDto } from './dto/query-order.dto.js';
import type { AdminQueryOrderDto } from './dto/admin-query-order.dto.js';
import type { CreateOrderEvidenceDto } from './dto/create-order-evidence.dto.js';
import type { OrderEvidenceResponseDto } from './dto/order-evidence-response.dto.js';
import type { RequestReworkDto } from './dto/request-rework.dto.js';
import type { CancelOrderDto } from './dto/cancel-order.dto.js';
import type { DisputeOrderDto } from './dto/dispute-order.dto.js';
import type { ResolveDisputeDto } from './dto/resolve-dispute.dto.js';
import type {
  OrderResponseDto,
  OrderStatusHistoryItemDto,
} from './dto/order-response.dto.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: OrderOutboxRepository,
  ) {}

  /**
   * Worker accepts a booking proposal to create an official order atomically (ORD-06).
   * Executes a single ACID transaction with pessimistic locking, concurrency guards,
   * address snapshotting, proposal finalization, competing proposal supersession,
   * status history recording, and outbox event publishing.
   */
  async acceptProposal(
    proposalId: string,
    workerUserId: string,
  ): Promise<OrderResponseDto> {
    // 1. Initial query to resolve serviceRequestId for consistent hierarchical locking
    const initialProposal = await this.prisma.bookingProposal.findUnique({
      where: { id: proposalId },
      select: { id: true, serviceRequestId: true, workerUserId: true },
    });

    if (!initialProposal) {
      throw new NotFoundException({
        code: ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
        message: ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
      });
    }

    if (initialProposal.workerUserId !== workerUserId) {
      throw new ForbiddenException({
        code: ORDER_ERROR_CODES.NOT_PROPOSAL_PARTICIPANT,
        message: 'Only the assigned worker can accept this booking proposal',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // 2. Strict hierarchical locking: lock ServiceRequest FIRST, then BookingProposal
      if (typeof tx.$queryRaw === 'function') {
        try {
          await tx.$queryRaw`
            SELECT id FROM order_service.service_requests
            WHERE id = ${initialProposal.serviceRequestId}::uuid
            FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT id FROM order_service.booking_proposals
            WHERE id = ${proposalId}::uuid
            FOR UPDATE
          `;
        } catch {
          // Non-blocking in mock environments
        }
      }

      // 3. Query Proposal along with Service Request
      const proposal = await tx.bookingProposal.findUnique({
        where: { id: proposalId },
        include: { serviceRequest: true },
      });

      if (!proposal) {
        throw new NotFoundException({
          code: ORDER_ERROR_CODES.PROPOSAL_NOT_FOUND,
          message: ORDER_ERROR_MESSAGES.PROPOSAL_NOT_FOUND,
        });
      }

      // 4. Verify caller is the assigned Worker
      if (proposal.workerUserId !== workerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_PROPOSAL_PARTICIPANT,
          message: 'Only the assigned worker can accept this booking proposal',
        });
      }

      // 5. Verify Proposal status is proposed
      if (proposal.status !== 'proposed') {
        if (proposal.status === 'finalized') {
          throw new ConflictException({
            code: ORDER_ERROR_CODES.PROPOSAL_ALREADY_FINALIZED,
            message: ORDER_ERROR_MESSAGES.PROPOSAL_ALREADY_FINALIZED,
          });
        }
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Cannot accept proposal with status '${proposal.status}'. Only proposed proposals can be accepted.`,
        });
      }

      // 6. Verify Proposal expiration
      const now = new Date();
      if (proposal.expiresAt <= now) {
        throw new BadRequestException({
          code: ORDER_ERROR_CODES.DEADLINE_EXPIRED,
          message: 'This booking proposal has expired',
        });
      }

      // 7. Verify Service Request invariants
      const request = proposal.serviceRequest;
      if (!request) {
        throw new NotFoundException({
          code: ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
          message: ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
        });
      }

      if (
        request.status !== 'open_for_bidding' &&
        request.status !== 'bidding_closed'
      ) {
        if (request.status === 'converted_to_order') {
          throw new ConflictException({
            code: ORDER_ERROR_CODES.REQUEST_ALREADY_CONVERTED,
            message: ORDER_ERROR_MESSAGES.REQUEST_ALREADY_CONVERTED,
          });
        }
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Service request status '${request.status}' cannot be converted to order`,
        });
      }

      if (request.selectionExpiresAt && request.selectionExpiresAt <= now) {
        throw new BadRequestException({
          code: ORDER_ERROR_CODES.DEADLINE_EXPIRED,
          message: 'Selection deadline for this service request has expired',
        });
      }

      // 8. Double Order Protection: Verify no existing order exists for this service request
      const existingOrder = await tx.order.findUnique({
        where: { serviceRequestId: request.id },
      });
      if (existingOrder) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.ORDER_ALREADY_EXISTS,
          message: ORDER_ERROR_MESSAGES.ORDER_ALREADY_EXISTS,
        });
      }

      // 9. Generate Order Code and Snapshot Immutable Data
      const orderCode = generateOrderCode();
      const createdOrder = await tx.order.create({
        data: {
          orderCode,
          serviceRequestId: request.id,
          bookingProposalId: proposal.id,
          customerUserId: proposal.customerUserId,
          workerUserId: proposal.workerUserId,
          serviceId: request.serviceId!,
          selectionSource: proposal.selectionSource,
          selectedBidId: proposal.sourceBidId,
          selectedMatchResultId: proposal.sourceMatchResultId,
          agreedPrice: proposal.agreedPrice,
          agreedScope: proposal.agreedScope,
          scheduledAt: proposal.scheduledAt ?? request.scheduledAt,
          addressText: request.addressText ?? '',
          latitude: request.latitude ?? new Prisma.Decimal(0),
          longitude: request.longitude ?? new Prisma.Decimal(0),
          status: 'created',
          paymentState: 'unpaid',
        },
      });

      // 10. Conditional atomic update on proposal
      const propUpdate = await tx.bookingProposal.updateMany({
        where: {
          id: proposal.id,
          status: 'proposed',
        },
        data: {
          status: 'finalized',
          finalizedAt: now,
        },
      });

      if (propUpdate.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.PROPOSAL_ALREADY_FINALIZED,
          message: ORDER_ERROR_MESSAGES.PROPOSAL_ALREADY_FINALIZED,
        });
      }

      // 11. Invalidate/supersede all other proposals belonging to this request
      await tx.bookingProposal.updateMany({
        where: {
          serviceRequestId: request.id,
          id: { not: proposal.id },
          status: { in: ['proposed', 'changes_requested'] },
        },
        data: {
          status: 'superseded',
        },
      });

      // 12. Conditional atomic update on Service Request to converted_to_order
      const reqUpdate = await tx.serviceRequest.updateMany({
        where: {
          id: request.id,
          status: { in: ['open_for_bidding', 'bidding_closed'] },
        },
        data: {
          status: 'converted_to_order',
          version: { increment: 1 },
        },
      });

      if (reqUpdate.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.REQUEST_ALREADY_CONVERTED,
          message: ORDER_ERROR_MESSAGES.REQUEST_ALREADY_CONVERTED,
        });
      }

      // 13. Create initial order status history
      const historyEntry = await tx.orderStatusHistory.create({
        data: {
          orderId: createdOrder.id,
          fromStatus: null,
          toStatus: 'created',
          changedByUserId: workerUserId,
          reason: 'Order created upon worker acceptance of booking proposal',
        },
      });

      // 14. Publish outbox event order.created in the SAME transaction
      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: createdOrder.id,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_CREATED,
          eventVersion: 1,
          payload: {
            orderId: createdOrder.id,
            orderCode: createdOrder.orderCode,
            serviceRequestId: request.id,
            requestId: request.id,
            bookingProposalId: proposal.id,
            customerUserId: createdOrder.customerUserId,
            customerId: createdOrder.customerUserId,
            workerUserId: createdOrder.workerUserId,
            workerId: createdOrder.workerUserId,
            selectionSource: createdOrder.selectionSource,
            selectedBidId: createdOrder.selectedBidId ?? null,
            selectedMatchResultId: createdOrder.selectedMatchResultId ?? null,
            serviceId: createdOrder.serviceId,
            agreedPrice: createdOrder.agreedPrice.toString(),
            currency: 'VND',
            scheduledAt: createdOrder.scheduledAt?.toISOString() ?? null,
            addressText: createdOrder.addressText,
            latitude: Number(createdOrder.latitude),
            longitude: Number(createdOrder.longitude),
            createdAt: createdOrder.createdAt.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(
        `Order ${createdOrder.id} (${createdOrder.orderCode}) created atomically from proposal ${proposal.id} by worker ${workerUserId}`,
      );

      return this.formatOrderResponse({
        ...createdOrder,
        statusHistory: [historyEntry],
      });
    });
  }

  /**
   * Worker confirms readiness to execute the order (created -> confirmed) (ORD-07).
   */
  async confirmReadiness(
    orderId: string,
    workerUserId: string,
  ): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.workerUserId !== workerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only the assigned worker can confirm readiness for this order',
        });
      }

      if (order.status !== 'created') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Order in status '${order.status}' cannot be confirmed. Status must be 'created'.`,
        });
      }

      const now = new Date();
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'created',
        },
        data: {
          status: 'confirmed',
          confirmedAt: now,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Order status changed concurrently and cannot be confirmed',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'created',
          toStatus: 'confirmed',
          changedByUserId: workerUserId,
          reason: 'Worker confirmed readiness to execute work',
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: orderId,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_CONFIRMED,
          eventVersion: 1,
          payload: {
            orderId,
            orderCode: order.orderCode,
            workerUserId,
            customerUserId: order.customerUserId,
            confirmedAt: now.toISOString(),
          },
        },
        tx,
      );

      await this.emitOrderStatusChangedEvent(
        tx,
        order,
        'created',
        'confirmed',
        { confirmedAt: now.toISOString() },
      );

      this.logger.log(`Order ${orderId} confirmed by worker ${workerUserId}`);
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Worker starts executing the order (confirmed -> in_progress) (ORD-07).
   * Note: Order Service does NOT block start on payment holding.
   */
  async start(
    orderId: string,
    workerUserId: string,
  ): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.workerUserId !== workerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only the assigned worker can start work on this order',
        });
      }

      if (order.status !== 'confirmed') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Order in status '${order.status}' cannot be started. Status must be 'confirmed'.`,
        });
      }

      const now = new Date();
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'confirmed',
        },
        data: {
          status: 'in_progress',
          startedAt: now,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Order status changed concurrently and cannot be started',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'confirmed',
          toStatus: 'in_progress',
          changedByUserId: workerUserId,
          reason: 'Worker started work execution',
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: orderId,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STARTED,
          eventVersion: 1,
          payload: {
            orderId,
            orderCode: order.orderCode,
            workerUserId,
            customerUserId: order.customerUserId,
            startedAt: now.toISOString(),
          },
        },
        tx,
      );

      await this.emitOrderStatusChangedEvent(
        tx,
        order,
        'confirmed',
        'in_progress',
        { startedAt: now.toISOString() },
      );

      this.logger.log(`Order ${orderId} started by worker ${workerUserId}`);
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Worker reports work completion (in_progress -> awaiting_customer_confirmation) (ORD-07, ORD-10).
   * Strictly enforces that at least one piece of evidence has been attached!
   */
  async finish(
    orderId: string,
    workerUserId: string,
  ): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.workerUserId !== workerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only the assigned worker can finish this order',
        });
      }

      if (order.status !== 'in_progress') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Order in status '${order.status}' cannot be marked as finished. Status must be 'in_progress'.`,
        });
      }

      // ORD-10 Guard: Verify at least one evidence image/video exists inside the locked transaction
      const evidenceCount =
        (order as any)._count?.evidences !== undefined
          ? (order as any)._count.evidences
          : await tx.orderEvidence.count({
              where: { orderId },
            });

      if (evidenceCount === 0) {
        throw new BadRequestException({
          code: ORDER_ERROR_CODES.MISSING_EVIDENCE,
          message: ORDER_ERROR_MESSAGES.MISSING_EVIDENCE,
        });
      }

      const now = new Date();
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'in_progress',
        },
        data: {
          status: 'awaiting_customer_confirmation',
          workerFinishedAt: now,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Order status changed concurrently and cannot be finished',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'in_progress',
          toStatus: 'awaiting_customer_confirmation',
          changedByUserId: workerUserId,
          reason: 'Worker completed work and submitted evidence for confirmation',
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: orderId,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_FINISHED,
          eventVersion: 1,
          payload: {
            orderId,
            orderCode: order.orderCode,
            workerUserId,
            customerUserId: order.customerUserId,
            finishedAt: now.toISOString(),
          },
        },
        tx,
      );

      await this.emitOrderStatusChangedEvent(
        tx,
        order,
        'in_progress',
        'awaiting_customer_confirmation',
        { finishedAt: now.toISOString() },
      );

      this.logger.log(
        `Order ${orderId} marked as finished by worker ${workerUserId}`,
      );
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Customer confirms completion (awaiting_customer_confirmation -> completed) (ORD-07).
   * Emits exactly 1 transactional 'order.completed' event to Payment Service for settlement.
   */
  async confirmCompletion(
    orderId: string,
    customerUserId: string,
  ): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.customerUserId !== customerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only the ordering customer can confirm completion of this order',
        });
      }

      if (order.status !== 'awaiting_customer_confirmation') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Order in status '${order.status}' cannot be completed. Status must be 'awaiting_customer_confirmation'.`,
        });
      }

      const now = new Date();
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'awaiting_customer_confirmation',
        },
        data: {
          status: 'completed',
          completedAt: now,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Order was already completed or status changed concurrently',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'awaiting_customer_confirmation',
          toStatus: 'completed',
          changedByUserId: customerUserId,
          reason: 'Customer accepted work and confirmed order completion',
        },
      });

      // Exactly 1 transactional order.completed event for Payment settlement
      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: orderId,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_COMPLETED,
          eventVersion: 1,
          payload: {
            orderId,
            orderCode: order.orderCode,
            customerUserId,
            customerId: customerUserId,
            workerUserId: order.workerUserId,
            workerId: order.workerUserId,
            serviceId: order.serviceId,
            agreedPrice: order.agreedPrice.toString(),
            currency: 'VND',
            completedAt: now.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(
        `Order ${orderId} completed and confirmed by customer ${customerUserId}`,
      );
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Customer requests rework (awaiting_customer_confirmation -> in_progress) (ORD-07).
   */
  async requestRework(
    orderId: string,
    customerUserId: string,
    dto: RequestReworkDto,
  ): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.customerUserId !== customerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only the ordering customer can request rework for this order',
        });
      }

      if (order.status !== 'awaiting_customer_confirmation') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Rework can only be requested when order is in 'awaiting_customer_confirmation' status`,
        });
      }

      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'awaiting_customer_confirmation',
        },
        data: {
          status: 'in_progress',
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Order status changed concurrently and rework cannot be requested',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'awaiting_customer_confirmation',
          toStatus: 'in_progress',
          changedByUserId: customerUserId,
          reason: dto.reason,
        },
      });

      await this.emitOrderStatusChangedEvent(
        tx,
        order,
        'awaiting_customer_confirmation',
        'in_progress',
        { reason: dto.reason },
      );

      this.logger.log(
        `Customer ${customerUserId} requested rework on order ${orderId}: ${dto.reason}`,
      );
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Cancel an order in created or confirmed status (ORD-08).
   */
  async cancel(
    orderId: string,
    userId: string,
    dto: CancelOrderDto,
    roles: string[] = [],
  ): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      const isAdmin = roles.includes('Admin');
      const isParticipant =
        order.customerUserId === userId || order.workerUserId === userId;

      if (!isAdmin && !isParticipant) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'You are not authorized to cancel this order',
        });
      }

      if (order.status !== 'created' && order.status !== 'confirmed') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Orders can only be cancelled while in 'created' or 'confirmed' status. Current status is '${order.status}'.`,
        });
      }

      const now = new Date();
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: ['created', 'confirmed'] },
        },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: dto.reason,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Order was already cancelled or status changed concurrently',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'cancelled',
          changedByUserId: userId,
          reason: dto.reason,
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: orderId,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_CANCELLED,
          eventVersion: 1,
          payload: {
            orderId,
            orderCode: order.orderCode,
            customerUserId: order.customerUserId,
            customerId: order.customerUserId,
            workerUserId: order.workerUserId,
            workerId: order.workerUserId,
            cancelledByUserId: userId,
            cancelReason: dto.reason,
            cancelledAt: now.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(`Order ${orderId} cancelled by user ${userId}`);
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Add proof of work evidence (ORD-10).
   * Allowed ONLY for the assigned Worker while the order is in_progress.
   */
  async addEvidence(
    orderId: string,
    workerUserId: string,
    dto: CreateOrderEvidenceDto,
  ): Promise<OrderEvidenceResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.workerUserId !== workerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only the assigned worker can upload evidence for this order',
        });
      }

      if (order.status !== 'in_progress') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Evidence can only be uploaded while the order is in 'in_progress' status. Current status is '${order.status}'.`,
        });
      }

      const evidence = await tx.orderEvidence.create({
        data: {
          orderId,
          mediaType: dto.mediaType,
          mediaUrl: dto.mediaUrl,
          description: dto.description,
        },
      });

      this.logger.log(
        `Evidence ${evidence.id} (${evidence.mediaType}) attached to order ${orderId} by worker ${workerUserId}`,
      );

      return {
        id: evidence.id,
        orderId: evidence.orderId,
        mediaType: evidence.mediaType,
        mediaUrl: evidence.mediaUrl,
        description: evidence.description,
        createdAt: evidence.createdAt,
      };
    });
  }

  /**
   * View all proof of work evidences for an order (ORD-10).
   */
  async getEvidences(
    orderId: string,
    userId: string,
    roles: string[] = [],
  ): Promise<OrderEvidenceResponseDto[]> {
    await this.findById(orderId, userId, roles);

    const evidences = await this.prisma.orderEvidence.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return evidences.map((e) => ({
      id: e.id,
      orderId: e.orderId,
      mediaType: e.mediaType,
      mediaUrl: e.mediaUrl,
      description: e.description,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Delete an evidence before finishing the order (ORD-10).
   */
  async deleteEvidence(
    orderId: string,
    evidenceId: string,
    workerUserId: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.workerUserId !== workerUserId) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only the assigned worker can delete evidence for this order',
        });
      }

      if (order.status !== 'in_progress') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Evidence can only be deleted while the order is in 'in_progress' status. Current status is '${order.status}'.`,
        });
      }

      const evidence = await tx.orderEvidence.findFirst({
        where: { id: evidenceId, orderId },
      });

      if (!evidence) {
        throw new NotFoundException({
          code: ORDER_ERROR_CODES.EVIDENCE_NOT_FOUND,
          message: ORDER_ERROR_MESSAGES.EVIDENCE_NOT_FOUND,
        });
      }

      await tx.orderEvidence.delete({
        where: { id: evidenceId },
      });

      this.logger.log(
        `Evidence ${evidenceId} deleted from order ${orderId} by worker ${workerUserId}`,
      );
    });
  }

  /**
   * Open a dispute on an active order (ORD-08, ORD-10).
   * Customer or Worker can open dispute when status is in_progress or awaiting_customer_confirmation.
   */
  async dispute(
    orderId: string,
    userId: string,
    dto: DisputeOrderDto,
  ): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      const isParticipant =
        order.customerUserId === userId || order.workerUserId === userId;

      if (!isParticipant) {
        throw new ForbiddenException({
          code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
          message: 'Only participants in this order can open a dispute',
        });
      }

      if (
        order.status !== 'in_progress' &&
        order.status !== 'awaiting_customer_confirmation'
      ) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Disputes can only be opened when the order is 'in_progress' or 'awaiting_customer_confirmation'. Current status is '${order.status}'.`,
        });
      }

      const now = new Date();
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: ['in_progress', 'awaiting_customer_confirmation'] },
        },
        data: {
          status: 'disputed',
          disputePreviousStatus: order.status,
          disputedAt: now,
          disputeReason: dto.reason,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Order status changed concurrently and dispute cannot be opened',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'disputed',
          changedByUserId: userId,
          reason: dto.reason,
        },
      });

      await this.outboxRepo.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: orderId,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_DISPUTED,
          eventVersion: 1,
          payload: {
            orderId,
            orderCode: order.orderCode,
            customerUserId: order.customerUserId,
            workerUserId: order.workerUserId,
            disputedByUserId: userId,
            disputeReason: dto.reason,
            disputedAt: now.toISOString(),
          },
        },
        tx,
      );

      await this.emitOrderStatusChangedEvent(
        tx,
        order,
        order.status,
        'disputed',
        { disputeReason: dto.reason, disputedAt: now.toISOString() },
      );

      this.logger.log(`Order ${orderId} moved to disputed by user ${userId}`);
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Admin resolves an active dispute (ORD-08).
   * Actions:
   * - resume_previous_state: Return to state before dispute.
   * - cancel: Cancel the order.
   * - complete: Complete the order and emit exactly 1 'order.completed' event to Payment Service.
   */
  async resolveDispute(
    orderId: string,
    adminUserId: string,
    dto: ResolveDisputeDto,
    roles: string[] = [],
  ): Promise<OrderResponseDto> {
    if (!roles.some((r) => r.toLowerCase() === 'admin')) {
      throw new ForbiddenException({
        code: ORDER_ERROR_CODES.FORBIDDEN_ROLE,
        message: 'Only administrators can resolve order disputes',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockAndGetOrderOrThrow(orderId, tx);

      if (order.status !== 'disputed') {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: `Only orders in 'disputed' status can be resolved. Current status is '${order.status}'.`,
        });
      }

      const now = new Date();
      let nextStatus = order.disputePreviousStatus ?? 'in_progress';
      const orderUpdateData: Prisma.OrderUpdateInput = {
        disputeResolvedAt: now,
        disputeResolutionNote: dto.resolutionNote,
      };

      if (dto.action === 'resume_previous_state') {
        nextStatus = order.disputePreviousStatus ?? 'in_progress';
        orderUpdateData.status = nextStatus;

        await this.emitOrderStatusChangedEvent(
          tx,
          order,
          'disputed',
          nextStatus,
          { resolutionNote: dto.resolutionNote, resolvedAt: now.toISOString() },
        );
      } else if (dto.action === 'cancel') {
        nextStatus = 'cancelled';
        orderUpdateData.status = nextStatus;
        orderUpdateData.cancelledAt = now;
        orderUpdateData.cancelReason = dto.resolutionNote;

        await this.outboxRepo.createEvent(
          {
            aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
            aggregateId: orderId,
            eventType: ORDER_CONSTANTS.EVENT_ORDER_CANCELLED,
            eventVersion: 1,
            payload: {
              orderId,
              orderCode: order.orderCode,
              customerUserId: order.customerUserId,
              customerId: order.customerUserId,
              workerUserId: order.workerUserId,
              workerId: order.workerUserId,
              cancelledByUserId: adminUserId,
              cancelReason: dto.resolutionNote,
              cancelledAt: now.toISOString(),
            },
          },
          tx,
        );
      } else if (dto.action === 'complete') {
        nextStatus = 'completed';
        orderUpdateData.status = nextStatus;
        orderUpdateData.completedAt = now;

        // Exactly 1 transactional order.completed event for Payment settlement
        await this.outboxRepo.createEvent(
          {
            aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
            aggregateId: orderId,
            eventType: ORDER_CONSTANTS.EVENT_ORDER_COMPLETED,
            eventVersion: 1,
            payload: {
              orderId,
              orderCode: order.orderCode,
              customerUserId: order.customerUserId,
              customerId: order.customerUserId,
              workerUserId: order.workerUserId,
              workerId: order.workerUserId,
              serviceId: order.serviceId,
              agreedPrice: order.agreedPrice.toString(),
              currency: 'VND',
              completedAt: now.toISOString(),
            },
          },
          tx,
        );
      }

      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          status: 'disputed',
        },
        data: {
          ...orderUpdateData,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          message: 'Dispute was already resolved or order status changed concurrently',
        });
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'disputed',
          toStatus: nextStatus,
          changedByUserId: adminUserId,
          reason: dto.resolutionNote,
        },
      });

      this.logger.log(
        `Order ${orderId} dispute resolved by Admin ${adminUserId} with action: ${dto.action}`,
      );
      return this.formatOrderResponse({
        ...updatedOrder,
        statusHistory: [history],
      });
    });
  }

  /**
   * Find single order by ID with authorization check.
   */
  async findById(
    orderId: string,
    userId: string,
    roles: string[] = [],
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        evidences: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: ORDER_ERROR_CODES.ORDER_NOT_FOUND,
        message: ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
      });
    }

    const isAdmin = roles.includes('Admin');
    const isParticipant =
      order.customerUserId === userId || order.workerUserId === userId;

    if (!isAdmin && !isParticipant) {
      throw new ForbiddenException({
        code: ORDER_ERROR_CODES.NOT_ORDER_OWNER,
        message: ORDER_ERROR_MESSAGES.NOT_ORDER_OWNER,
      });
    }

    return this.formatOrderResponse(order);
  }

  /**
   * List paginated orders for the current user.
   */
  async findAll(
    userId: string,
    query: QueryOrderDto,
    roles: string[] = [],
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const isAdmin = roles.includes('Admin');
    const where: Prisma.OrderWhereInput = {};

    if (!isAdmin) {
      where.OR = [
        { customerUserId: userId },
        { workerUserId: userId },
      ];
    }

    if (query.status) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 1) {
        where.status = { in: statuses as Prisma.EnumOrderStatusFilter['in'] };
      } else if (statuses.length === 1) {
        where.status = statuses[0] as Prisma.EnumOrderStatusFilter['equals'];
      }
    }

    if (query.paymentState) {
      where.paymentState =
        query.paymentState as Prisma.EnumPaymentStateFilter['equals'];
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((item) => this.formatOrderResponse(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Admin global order query with advanced filters.
   */
  async adminFindAll(
    query: AdminQueryOrderDto,
    roles: string[] = ['Admin'],
  ) {
    const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
    if (!isAdmin) {
      throw new ForbiddenException({
        code: ORDER_ERROR_CODES.FORBIDDEN_ROLE,
        message: 'Only administrators can query all orders',
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query.customerUserId) {
      where.customerUserId = query.customerUserId;
    }

    if (query.workerUserId) {
      where.workerUserId = query.workerUserId;
    }

    if (query.status) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 1) {
        where.status = { in: statuses as Prisma.EnumOrderStatusFilter['in'] };
      } else if (statuses.length === 1) {
        where.status = statuses[0] as Prisma.EnumOrderStatusFilter['equals'];
      }
    }

    if (query.paymentState) {
      where.paymentState =
        query.paymentState as Prisma.EnumPaymentStateFilter['equals'];
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((item) => this.formatOrderResponse(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get status timeline history for an order.
   */
  async getStatusHistory(
    orderId: string,
    userId: string,
    roles: string[] = [],
  ): Promise<OrderStatusHistoryItemDto[]> {
    await this.findById(orderId, userId, roles);

    const history = await this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return history.map((item) => ({
      id: item.id,
      fromStatus: item.fromStatus,
      toStatus: item.toStatus,
      changedByUserId: item.changedByUserId,
      reason: item.reason,
      createdAt: item.createdAt,
    }));
  }

  /**
   * Internal helper to load an order or throw 404.
   */
  private async getOrderOrThrow(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException({
        code: ORDER_ERROR_CODES.ORDER_NOT_FOUND,
        message: ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
      });
    }

    return order;
  }

  /**
   * Internal helper to lock an order row (SELECT FOR UPDATE) and retrieve it within a transaction.
   */
  private async lockAndGetOrderOrThrow(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Prisma.OrderGetPayload<Record<string, never>>> {
    if (typeof tx.$queryRaw === 'function') {
      try {
        await tx.$queryRaw`
          SELECT id FROM order_service.orders
          WHERE id = ${orderId}::uuid
          FOR UPDATE
        `;
      } catch {
        // Non-blocking in mock environments
      }
    }

    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException({
        code: ORDER_ERROR_CODES.ORDER_NOT_FOUND,
        message: ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
      });
    }

    return order;
  }

  /**
   * Internal mapper to format Prisma order into OrderResponseDto.
   */
  private formatOrderResponse(
    order: any,
  ): OrderResponseDto {
    return {
      id: order.id,
      orderCode: order.orderCode,
      serviceRequestId: order.serviceRequestId,
      bookingProposalId: order.bookingProposalId,
      customerUserId: order.customerUserId,
      workerUserId: order.workerUserId,
      serviceId: order.serviceId,
      selectionSource: order.selectionSource,
      selectedBidId: order.selectedBidId,
      selectedMatchResultId: order.selectedMatchResultId,
      agreedPrice:
        typeof order.agreedPrice?.toString === 'function'
          ? order.agreedPrice.toString()
          : String(order.agreedPrice),
      agreedScope: order.agreedScope,
      scheduledAt: order.scheduledAt,
      addressText: order.addressText,
      latitude: Number(order.latitude),
      longitude: Number(order.longitude),
      status: order.status,
      paymentState: order.paymentState,
      confirmedAt: order.confirmedAt,
      startedAt: order.startedAt,
      workerFinishedAt: order.workerFinishedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      disputedAt: order.disputedAt,
      disputeReason: order.disputeReason,
      disputePreviousStatus: order.disputePreviousStatus,
      disputeResolvedAt: order.disputeResolvedAt,
      disputeResolutionNote: order.disputeResolutionNote,
      evidences: order.evidences?.map((e: any) => ({
        id: e.id,
        orderId: e.orderId,
        mediaType: e.mediaType,
        mediaUrl: e.mediaUrl,
        description: e.description,
        createdAt: e.createdAt,
      })),
      statusHistory: order.statusHistory?.map((h: any) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedByUserId: h.changedByUserId,
        reason: h.reason,
        createdAt: h.createdAt,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Helper to emit order.status.changed outbox event for progress transitions.
   */
  private async emitOrderStatusChangedEvent(
    tx: Prisma.TransactionClient,
    order: { id: string; customerUserId: string; workerUserId: string },
    previousStatus: string,
    nextStatus: string,
    extraPayload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.outboxRepo.createEvent(
      {
        aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
        aggregateId: order.id,
        eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
        eventVersion: 1,
        payload: {
          orderId: order.id,
          customerId: order.customerUserId,
          customerUserId: order.customerUserId,
          workerId: order.workerUserId,
          workerUserId: order.workerUserId,
          previousStatus,
          nextStatus,
          notificationKind: 'status_update',
          ...extraPayload,
        },
      },
      tx,
    );
  }
}
