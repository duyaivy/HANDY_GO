import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import type { Refund } from '@prisma/payment-client';
import { AdminAuditService } from '../common/audit/admin-audit.service.js';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { parseOrderAmount } from '../common/money/payment-money.js';
import type { PaymentTx } from '../common/outbox/payment-events.js';
import { paymentRefundedEvent } from '../common/outbox/payment-events.js';
import { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';
import { WalletClient } from '../common/clients/wallet.client.js';
import type { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import type { CreateRefundDto, DecideRefundDto } from './dto/refunds.dto.js';

const reservedStatuses = [
  'pending',
  'processing',
  'needs_review',
  'completed',
] as const;
const fundingBlocked = 'Awaiting funded Wallet refund confirmation';
function conflict(message: string): never {
  throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, message);
}
function missing(): never {
  throw new AppException(
    HttpStatus.NOT_FOUND,
    ERROR_CODES.NOT_FOUND,
    'Payment or refund not found',
  );
}

function serialize(row: Refund) {
  return {
    id: row.id,
    paymentId: row.paymentId,
    amount: row.amountVnd.toString(),
    status: row.status,
    destination: 'point' as const,
    reason: row.reason,
    requestedByUserId: row.requestedByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    rejectedByUserId: row.rejectedByUserId,
    rejectedAt: row.rejectedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
    refundedAt: row.refundedAt,
  };
}

@Injectable()
export class RefundsService {
  constructor(
    private readonly database: PaymentPrismaService,
    private readonly audit: AdminAuditService,
    private readonly wallet: WalletClient,
    private readonly outbox: PaymentOutboxService,
  ) {}

  private async lockPayment(tx: PaymentTx, id: string) {
    await tx.$queryRaw`SELECT id FROM payment_service.payments WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.payment.findUnique({ where: { id } });
  }

  async create(
    actor: string,
    paymentId: string,
    dto: CreateRefundDto,
    admin = false,
  ) {
    let amount: bigint;
    try {
      amount = parseOrderAmount(dto.amount);
    } catch {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid whole VND amount',
      );
    }
    if (!dto.reason.trim() || !dto.idempotencyKey.trim())
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Reason and idempotency key are required',
      );
    return this.database.client.$transaction(async (tx) => {
      // All reservation/decision writers lock the parent first, including requests for different refund IDs.
      const payment = await this.lockPayment(tx, paymentId);
      if (!payment || (!admin && payment.customerUserId !== actor)) missing();
      // Serialize identical global keys too, so collisions across payments return a controlled conflict.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.idempotencyKey}))::text`;
      const previous = await tx.refund.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (previous) {
        if (
          previous.paymentId !== paymentId ||
          previous.requestedByUserId !== actor ||
          previous.amountVnd !== amount ||
          previous.reason !== dto.reason
        )
          conflict('Idempotency key was used for another request');
        return serialize(previous);
      }
      if (!['succeeded', 'partially_refunded'].includes(payment.status))
        conflict('Only settled payments can be refunded');
      const sum = await tx.refund.aggregate({
        where: { paymentId, status: { in: [...reservedStatuses] } },
        _sum: { amountVnd: true },
      });
      if ((sum._sum.amountVnd ?? 0n) + amount > payment.amount)
        conflict('Refund reservations exceed the paid amount');
      const row = await tx.refund.create({
        data: {
          paymentId,
          requestedByUserId: actor,
          amountVnd: amount,
          reason: dto.reason,
          idempotencyKey: dto.idempotencyKey,
        },
      });
      if (admin)
        await this.audit.record(tx, {
          actorUserId: actor,
          action: 'refund.created',
          entityType: 'refund',
          entityId: row.id,
          after: serialize(row),
          reason: dto.reason,
        });
      return serialize(row);
    });
  }

  async list(
    actor: string,
    paymentId: string,
    query: PaymentPaginationDto,
    admin = false,
  ) {
    const payment = await this.database.client.payment.findFirst({
      where: { id: paymentId, ...(admin ? {} : { customerUserId: actor }) },
      select: { id: true },
    });
    if (!payment) missing();
    const where = { paymentId };
    const [rows, total] = await this.database.client.$transaction([
      this.database.client.refund.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      }),
      this.database.client.refund.count({ where }),
    ]);
    return {
      items: rows.map(serialize),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async decide(actor: string, id: string, dto: DecideRefundDto) {
    if (!dto.reason.trim())
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Decision reason is required',
      );
    const decision = await this.database.client.$transaction(async (tx) => {
      const initial = await tx.refund.findUnique({ where: { id } });
      if (!initial) missing();
      const payment = await this.lockPayment(tx, initial.paymentId);
      if (
        payment?.customerUserId === actor ||
        initial.requestedByUserId === actor
      ) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.FORBIDDEN,
          'A requester/customer cannot decide their own refund',
        );
      }
      const row = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (row.status !== 'pending') {
        const replay = dto.approve
          ? row.approvedByUserId === actor &&
            ['needs_review', 'processing', 'completed'].includes(row.status)
          : row.rejectedByUserId === actor && row.status === 'cancelled';
        if (replay && row.decisionNote === dto.reason) return serialize(row);
        conflict('Refund already has an Admin decision');
      }
      const now = new Date();
      const updated = await tx.refund.update({
        where: { id },
        data: dto.approve
          ? {
              approvedByUserId: actor,
              approvedAt: now,
              decisionNote: dto.reason,
              status: 'needs_review',
              failureReason: fundingBlocked,
            }
          : {
              rejectedByUserId: actor,
              rejectedAt: now,
              decisionNote: dto.reason,
              status: 'cancelled',
            },
      });
      await this.audit.record(tx, {
        actorUserId: actor,
        action: dto.approve ? 'refund.approved' : 'refund.rejected',
        entityType: 'refund',
        entityId: id,
        before: serialize(row),
        after: serialize(updated),
        reason: dto.reason,
      });
      // Commit the authorization before making any remote call. Reconciliation resumes it after a crash.
      return serialize(updated);
    });
    if (dto.approve && decision.status !== 'completed') await this.execute(id);
    return serialize(
      await this.database.client.refund.findUniqueOrThrow({ where: { id } }),
    );
  }

  async execute(id: string): Promise<void> {
    const row = await this.database.client.refund.findUniqueOrThrow({
      where: { id },
      include: { payment: true },
    });
    if (!row.approvedAt || !['needs_review', 'processing'].includes(row.status))
      return;
    const payment = row.payment;
    if (payment.method !== 'cash' && payment.method !== 'point') return;
    await this.database.client.refund.updateMany({
      where: { id, status: { in: ['needs_review', 'processing'] } },
      data: {
        failureReason: 'Awaiting funded Wallet refund confirmation',
        updatedAt: new Date(),
      },
    });
    const operationId = `${payment.id}:refund:${id}`;
    // A timeout is never interpreted as a failure or permission to use another operation ID.
    let result = await this.wallet.getOperation(operationId);
    if (result.outcome === 'missing') {
      const credit = await this.wallet.refundCredit(payment.customerUserId, {
        paymentId: payment.id,
        refundId: id,
        amount: row.amountVnd.toString(),
        method: payment.method,
        grossAmount: payment.amount.toString(),
      });
      if (credit.outcome !== 'ok') return;
      result = await this.wallet.getOperation(operationId);
    }
    if (result.outcome !== 'ok') return;
    const committed = result.data;
    if (
      committed.status !== 'completed' ||
      committed.operationId !== operationId ||
      committed.kind !== 'refund' ||
      committed.amount !== row.amountVnd.toString() ||
      typeof committed.transferId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        committed.transferId,
      )
    )
      return;
    const transferId = committed.transferId;
    await this.database.client.$transaction(async (tx) => {
      const locked = await this.lockPayment(tx, payment.id);
      if (!locked) return;
      const current = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (current.status === 'completed') return;
      if (
        !current.approvedAt ||
        !['needs_review', 'processing'].includes(current.status)
      )
        return;
      const completed = await tx.refund.update({
        where: { id },
        data: {
          status: 'completed',
          refundedAt: new Date(),
          walletTransferId: transferId,
          failureReason: null,
        },
      });
      const sum = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: 'completed' },
        _sum: { amountVnd: true },
      });
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status:
            sum._sum.amountVnd === locked.amount
              ? 'refunded'
              : 'partially_refunded',
        },
      });
      await this.outbox.enqueue(tx, paymentRefundedEvent(updated, completed));
      await this.audit.record(tx, {
        actorUserId: current.approvedByUserId!,
        action: 'refund.completed',
        entityType: 'refund',
        entityId: id,
        after: serialize(completed),
        reason: 'Wallet ledger commit verified',
      });
    });
  }

  async resumeApproved(limit = 20): Promise<number> {
    const rows = await this.database.client.refund.findMany({
      where: {
        approvedAt: { not: null },
        status: { in: ['needs_review', 'processing'] },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    for (const row of rows) await this.execute(row.id);
    return rows.length;
  }
}
