import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConsumedEventRepository } from './consumed-event.repository.js';
import { OrderOutboxRepository } from '../outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../constants/order.constants.js';
import {
  ORDER_ERROR_CODES,
  ORDER_ERROR_MESSAGES,
} from '../constants/order-errors.js';
import type { Prisma } from '@prisma/order-client';

export type DisputeRefundEventKind = 'completed' | 'needs_review';
export type MismatchClassification = 'recoverable' | 'invalid';

export type DisputeRefundProcessResult =
  | { outcome: 'malformed' }
  | { outcome: 'duplicate' }
  | { outcome: 'processed' }
  | { outcome: 'reconciled_late'; reasonCode: string }
  | {
      outcome: 'mismatched';
      classification: MismatchClassification;
      reasonCode: string;
      reasonDetail: string;
    };

export interface ReconciliationListQuery {
  status?: string;
  orderId?: string;
  page?: number;
  limit?: number;
}

const VALID_RECONCILIATION_STATUSES = [
  'pending_reconciliation',
  'quarantined',
  'replayed',
  'reconciled_late',
] as const;

@Injectable()
export class DisputeRefundReconciliationService {
  private readonly logger = new Logger(DisputeRefundReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consumedEventRepo: ConsumedEventRepository,
    @Optional() private readonly outbox?: OrderOutboxRepository,
  ) {}

  private buildSafePayload(
    resolutionId: string,
    orderId: string,
    body: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const safe: Record<string, string> = {
      resolutionId,
      orderId,
    };
    if (typeof body.paymentId === 'string') {
      safe.paymentId = body.paymentId.slice(0, 100);
    }
    if (typeof body.refundId === 'string') {
      safe.refundId = body.refundId.slice(0, 100);
    }
    if (typeof body.refundAmountVnd === 'string') {
      safe.refundAmountVnd = body.refundAmountVnd.slice(0, 30);
    }
    if (typeof body.paymentStatus === 'string') {
      safe.paymentStatus = body.paymentStatus.slice(0, 40);
    }
    if (typeof body.failureCode === 'string') {
      safe.failureCode = body.failureCode.slice(
        0,
        ORDER_CONSTANTS.MAX_FAILURE_CODE_LENGTH,
      );
    }
    return safe;
  }

  private async markReconciliationReplayed(
    tx: Prisma.TransactionClient,
    eventId: string,
    now: Date,
    replayedByUserId?: string,
  ): Promise<void> {
    if (!tx.inboundEventReconciliation?.updateMany) return;
    await tx.inboundEventReconciliation.updateMany({
      where: {
        eventId,
        status: { in: ['pending_reconciliation', 'quarantined'] },
      },
      data: {
        status: 'replayed',
        replayedAt: now,
        ...(replayedByUserId ? { replayedByUserId } : {}),
      },
    });
  }

  async processDisputeRefundEvent(
    kind: DisputeRefundEventKind,
    raw: unknown,
    options?: { replayedByUserId?: string },
  ): Promise<DisputeRefundProcessResult> {
    const envelope =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const body = (envelope.data ?? envelope.payload ?? envelope) as Record<
      string,
      unknown
    >;
    const eventId = envelope.eventId ?? envelope.id;
    const resolutionId = body?.resolutionId;
    const orderId = body?.orderId;
    const normalizedEventId =
      typeof eventId === 'string' ? eventId.trim() : '';

    if (
      !normalizedEventId ||
      normalizedEventId.length > 100 ||
      !isUUID(String(resolutionId)) ||
      !isUUID(String(orderId))
    ) {
      this.logger.warn(
        `Rejected malformed dispute refund event (${kind}): eventId=${String(eventId)}, resolutionId=${String(resolutionId)}, orderId=${String(orderId)}`,
      );
      return { outcome: 'malformed' };
    }

    const eventType =
      kind === 'completed'
        ? ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_COMPLETED
        : ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW;
    const normalizedOrderId = orderId as string;
    const normalizedResolutionId = resolutionId as string;
    const safePayload = this.buildSafePayload(
      normalizedResolutionId,
      normalizedOrderId,
      body,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM order_service.orders WHERE id = ${normalizedOrderId}::uuid FOR UPDATE`;

      if (
        typeof this.consumedEventRepo.isEventConsumed === 'function' &&
        (await this.consumedEventRepo.isEventConsumed(normalizedEventId, tx))
      ) {
        return { outcome: 'duplicate' as const };
      }

      const parkMismatch = async (
        classification: MismatchClassification,
        reasonCode: string,
        reasonDetail: string,
      ): Promise<DisputeRefundProcessResult> => {
        const now = new Date();
        const status =
          classification === 'recoverable'
            ? 'pending_reconciliation'
            : 'quarantined';
        this.logger.warn(
          `Parked ${eventType} (eventId=${normalizedEventId}) as ${status} [${classification}/${reasonCode}]: ${reasonDetail}`,
        );
        await tx.inboundEventReconciliation.upsert({
          where: { eventId: normalizedEventId },
          create: {
            eventId: normalizedEventId,
            eventType,
            orderId: normalizedOrderId,
            resolutionId: normalizedResolutionId,
            classification,
            reasonCode,
            reasonDetail: reasonDetail.slice(0, 500),
            safePayload,
            status,
            attempts: 1,
            lastSeenAt: now,
          },
          update: {
            classification,
            reasonCode,
            reasonDetail: reasonDetail.slice(0, 500),
            safePayload,
            status,
            attempts: { increment: 1 },
            lastSeenAt: now,
          },
        });
        return {
          outcome: 'mismatched',
          classification,
          reasonCode,
          reasonDetail,
        };
      };

      const resolution = await tx.orderDisputeResolution.findUnique({
        where: { id: normalizedResolutionId },
      });
      const order = await tx.order.findUnique({
        where: { id: normalizedOrderId },
      });

      if (!resolution || !order) {
        return parkMismatch(
          'recoverable',
          'MISSING_RESOLUTION_OR_ORDER',
          `Missing resolution=${Boolean(resolution)} or order=${Boolean(order)} (resolutionId=${normalizedResolutionId}, orderId=${normalizedOrderId})`,
        );
      }

      if (resolution.orderId !== normalizedOrderId) {
        return parkMismatch(
          'invalid',
          'RESOLUTION_ORDER_MISMATCH',
          `Resolution orderId=${resolution.orderId} does not match event orderId=${normalizedOrderId}`,
        );
      }

      if (resolution.action !== 'refund') {
        return parkMismatch(
          'invalid',
          'RESOLUTION_ACTION_NOT_REFUND',
          `Resolution ${resolution.id} has action=${resolution.action}, expected refund`,
        );
      }

      if (resolution.paymentId !== body.paymentId) {
        return parkMismatch(
          'recoverable',
          'PAYMENT_ID_MISMATCH',
          `Expected paymentId=${String(resolution.paymentId)}, received paymentId=${String(body.paymentId)}`,
        );
      }

      if (kind === 'completed') {
        if (!isUUID(String(body.refundId))) {
          return parkMismatch(
            'invalid',
            'INVALID_REFUND_ID',
            `Completion event has invalid refundId=${String(body.refundId)}`,
          );
        }
        if (
          !['partially_refunded', 'refunded'].includes(
            String(body.paymentStatus),
          )
        ) {
          return parkMismatch(
            'invalid',
            'INVALID_PAYMENT_STATUS',
            `Completion event has invalid paymentStatus=${String(body.paymentStatus)}`,
          );
        }
        const expectedAmount = resolution.refundAmountVnd?.toString();
        if (body.refundAmountVnd !== expectedAmount) {
          return parkMismatch(
            'recoverable',
            'AMOUNT_MISMATCH',
            `Expected refundAmountVnd=${String(expectedAmount)}, received refundAmountVnd=${String(body.refundAmountVnd)}`,
          );
        }
      }

      if (kind === 'completed' && resolution.state === 'superseded') {
        // Authentic Wallet-backed completion arrived late after Admin override.
        // Reconcile Order paymentState with Payment truth and persist a durable audit record.
        const isNew = await this.consumedEventRepo.recordEventIfNew(
          normalizedEventId,
          eventType,
          tx,
        );
        if (!isNew) return { outcome: 'duplicate' as const };
        const now = new Date();
        const incomingPaymentState = body.paymentStatus as
          | 'partially_refunded'
          | 'refunded';
        const nextPaymentState =
          order.paymentState === 'refunded' ? 'refunded' : incomingPaymentState;

        if (order.paymentState !== nextPaymentState) {
          const synced = await tx.order.updateMany({
            where: { id: order.id, version: order.version },
            data: {
              paymentState: nextPaymentState,
              version: { increment: 1 },
            },
          });
          if (synced.count !== 1) {
            throw new Error(
              'Order changed concurrently during late superseded refund reconciliation',
            );
          }
        }

        await tx.orderDisputeResolution.update({
          where: { id: resolution.id },
          data: {
            refundId: body.refundId as string,
            failureCode: 'LATE_COMPLETION_AFTER_SUPERSEDE',
            resolvedAt: resolution.resolvedAt ?? now,
          },
        });

        const reasonCode = 'LATE_COMPLETION_FOR_SUPERSEDED_RESOLUTION';
        const reasonDetail = `Late refund completion reconciled for superseded resolution=${resolution.id} (orderId=${order.id}, refundId=${String(body.refundId)}, paymentState=${nextPaymentState})`;
        this.logger.warn(`${eventType} (eventId=${normalizedEventId}): ${reasonDetail}`);

        if (tx.inboundEventReconciliation?.upsert) {
          await tx.inboundEventReconciliation.upsert({
            where: { eventId: normalizedEventId },
            create: {
              eventId: normalizedEventId,
              eventType,
              orderId: normalizedOrderId,
              resolutionId: normalizedResolutionId,
              classification: 'recoverable',
              reasonCode,
              reasonDetail: reasonDetail.slice(0, 500),
              safePayload,
              status: 'reconciled_late',
              attempts: 1,
              lastSeenAt: now,
              replayedAt: now,
              replayedByUserId: options?.replayedByUserId ?? null,
            },
            update: {
              reasonCode,
              reasonDetail: reasonDetail.slice(0, 500),
              safePayload,
              status: 'reconciled_late',
              attempts: { increment: 1 },
              lastSeenAt: now,
              replayedAt: now,
              ...(options?.replayedByUserId
                ? { replayedByUserId: options.replayedByUserId }
                : {}),
            },
          });
        }
        return { outcome: 'reconciled_late' as const, reasonCode };
      }

      if (
        kind === 'completed' &&
        resolution.state === 'completed' &&
        resolution.refundId === body.refundId
      ) {
        await this.consumedEventRepo.recordEventIfNew(
          normalizedEventId,
          eventType,
          tx,
        );
        await this.markReconciliationReplayed(
          tx,
          normalizedEventId,
          new Date(),
          options?.replayedByUserId,
        );
        return { outcome: 'duplicate' as const };
      }

      if (!['refund_pending', 'needs_review'].includes(resolution.state)) {
        return parkMismatch(
          'recoverable',
          'RESOLUTION_STATE_NOT_PENDING',
          `Resolution ${resolution.id} is in state=${resolution.state}, expected refund_pending or needs_review`,
        );
      }

      if (kind === 'needs_review') {
        const isNew = await this.consumedEventRepo.recordEventIfNew(
          normalizedEventId,
          eventType,
          tx,
        );
        if (!isNew) return { outcome: 'duplicate' as const };
        const now = new Date();
        await tx.orderDisputeResolution.update({
          where: { id: resolution.id },
          data: {
            state: 'needs_review',
            failureCode:
              typeof body.failureCode === 'string'
                ? body.failureCode.slice(
                    0,
                    ORDER_CONSTANTS.MAX_FAILURE_CODE_LENGTH,
                  )
                : 'PAYMENT_REVIEW_REQUIRED',
          },
        });
        await this.markReconciliationReplayed(
          tx,
          normalizedEventId,
          now,
          options?.replayedByUserId,
        );
        return { outcome: 'processed' as const };
      }

      if (order.status !== 'disputed') {
        return parkMismatch(
          'recoverable',
          'ORDER_STATUS_NOT_DISPUTED',
          `Order ${order.id} is in status=${order.status}, expected disputed`,
        );
      }

      const isNew = await this.consumedEventRepo.recordEventIfNew(
        normalizedEventId,
        eventType,
        tx,
      );
      if (!isNew) return { outcome: 'duplicate' as const };

      const now = new Date();
      const changed = await tx.order.updateMany({
        where: { id: order.id, status: 'disputed', version: order.version },
        data: {
          status: 'completed',
          paymentState: body.paymentStatus as 'partially_refunded' | 'refunded',
          disputeResolvedAt: now,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new Error(
          'Order changed concurrently during dispute refund completion',
        );
      }
      await tx.orderDisputeResolution.update({
        where: { id: resolution.id },
        data: {
          state: 'completed',
          refundId: body.refundId as string,
          failureCode: null,
          resolvedAt: now,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'disputed',
          toStatus: 'completed',
          changedByUserId: resolution.adminUserId,
          reason: resolution.resolutionNote,
        },
      });
      if (!this.outbox) throw new Error('Order outbox is unavailable');
      const payload = {
        resolutionId: resolution.id,
        orderId: order.id,
        orderCode: order.orderCode,
        action: 'refund',
        customerUserId: order.customerUserId,
        workerUserId: order.workerUserId,
        paymentId: body.paymentId,
        refundId: body.refundId,
        refundAmountVnd: body.refundAmountVnd,
        paymentStatus: body.paymentStatus,
        resolvedStatus: 'completed',
        resolvedAt: now.toISOString(),
      };
      await this.outbox.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: order.id,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
          payload: {
            previousStatus: 'disputed',
            nextStatus: 'completed',
            notificationKind: 'status_update',
            customerId: order.customerUserId,
            workerId: order.workerUserId,
            ...payload,
          },
        },
        tx,
      );
      await this.outbox.createEvent(
        {
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: order.id,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_DISPUTE_RESOLVED,
          payload,
        },
        tx,
      );
      await this.markReconciliationReplayed(
        tx,
        normalizedEventId,
        now,
        options?.replayedByUserId,
      );
      return { outcome: 'processed' as const };
    });
  }

  async listReconciliations(
    query: ReconciliationListQuery,
    roles: string[] = [],
  ) {
    if (!roles.some((role) => role.toLowerCase() === 'admin')) {
      throw new ForbiddenException({
        code: ORDER_ERROR_CODES.FORBIDDEN_ROLE,
        message: ORDER_ERROR_MESSAGES.FORBIDDEN_ROLE,
      });
    }
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const where: Prisma.InboundEventReconciliationWhereInput = {};
    if (query.status) {
      if (
        !VALID_RECONCILIATION_STATUSES.includes(
          query.status as (typeof VALID_RECONCILIATION_STATUSES)[number],
        )
      ) {
        throw new BadRequestException('Invalid reconciliation status filter');
      }
      where.status = query.status;
    }
    if (query.orderId) {
      if (!isUUID(query.orderId)) {
        throw new BadRequestException('orderId must be a valid UUID');
      }
      where.orderId = query.orderId;
    }
    const [items, total] = await Promise.all([
      this.prisma.inboundEventReconciliation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inboundEventReconciliation.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async replayEvent(
    eventId: string,
    adminUserId: string,
    roles: string[] = [],
  ) {
    if (!roles.some((role) => role.toLowerCase() === 'admin')) {
      throw new ForbiddenException({
        code: ORDER_ERROR_CODES.FORBIDDEN_ROLE,
        message: ORDER_ERROR_MESSAGES.FORBIDDEN_ROLE,
      });
    }
    const normalizedEventId = eventId?.trim();
    if (!normalizedEventId || normalizedEventId.length > 100) {
      throw new BadRequestException('A valid eventId is required');
    }
    const row = await this.prisma.inboundEventReconciliation.findUnique({
      where: { eventId: normalizedEventId },
    });
    if (!row) {
      throw new NotFoundException({
        code: ORDER_ERROR_CODES.RECONCILIATION_EVENT_NOT_FOUND,
        message: ORDER_ERROR_MESSAGES.RECONCILIATION_EVENT_NOT_FOUND,
      });
    }
    if (
      row.status !== 'pending_reconciliation' ||
      row.classification !== 'recoverable'
    ) {
      throw new ConflictException({
        code: ORDER_ERROR_CODES.RECONCILIATION_REPLAY_NOT_ALLOWED,
        message: ORDER_ERROR_MESSAGES.RECONCILIATION_REPLAY_NOT_ALLOWED,
      });
    }
    const kind: DisputeRefundEventKind =
      row.eventType === ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_COMPLETED
        ? 'completed'
        : 'needs_review';
    const result = await this.processDisputeRefundEvent(
      kind,
      { eventId: row.eventId, payload: row.safePayload },
      { replayedByUserId: adminUserId },
    );
    if (result.outcome === 'mismatched') {
      throw new ConflictException({
        code: ORDER_ERROR_CODES.RECONCILIATION_REPLAY_STILL_MISMATCHED,
        message: `${ORDER_ERROR_MESSAGES.RECONCILIATION_REPLAY_STILL_MISMATCHED}: ${result.reasonCode}`,
        reasonCode: result.reasonCode,
      });
    }
    return {
      eventId: row.eventId,
      eventType: row.eventType,
      orderId: row.orderId,
      resolutionId: row.resolutionId,
      outcome: result.outcome,
    };
  }
}
