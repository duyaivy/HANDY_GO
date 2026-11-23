import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EVENT_PATTERNS } from '@app/common';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { AdminAuditService } from '../common/audit/admin-audit.service.js';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import { PermanentInboundError, requirePositiveInteger, requireUuid, unwrapInboundEvent } from '../common/inbound/inbound-event.js';
import { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';
import type { PaymentTx } from '../common/outbox/payment-events.js';
import { RefundsService } from '../refunds/refunds.service.js';

@Injectable()
export class DisputeRefundService implements OnModuleInit {
  private readonly logger = new Logger(DisputeRefundService.name);

  constructor(
    private readonly inbox: PaymentInboxService,
    private readonly database: PaymentPrismaService,
    private readonly outbox: PaymentOutboxService,
    private readonly audit: AdminAuditService,
    private readonly refunds: RefundsService,
  ) {}

  onModuleInit(): void {
    this.inbox.register(EVENT_PATTERNS.ORDER_DISPUTE_DECISION_RECORDED, (data, tx) => this.recordDecision(data, tx));
  }

  async recordDecision(data: Record<string, unknown>, tx: PaymentTx): Promise<void> {
    if (data.action !== 'refund') return;
    const resolutionId = requireUuid(data, 'resolutionId');
    const orderId = requireUuid(data, 'orderId');
    const paymentId = requireUuid(data, 'paymentId');
    const adminUserId = requireUuid(data, 'adminUserId');
    const customerUserId = requireUuid(data, 'customerUserId');
    const workerUserId = requireUuid(data, 'workerUserId');
    const amount = requirePositiveInteger(data, 'refundAmountVnd');
    const note = data.resolutionNote;
    if (typeof note !== 'string' || note.trim().length < 5) throw new PermanentInboundError('Resolution note is invalid');
    await tx.$queryRaw`SELECT id FROM payment_service.payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.orderId !== orderId || payment.customerUserId !== customerUserId || payment.workerUserId !== workerUserId) {
      throw new PermanentInboundError('Dispute decision contradicts Payment snapshot');
    }
    const existing = await tx.refund.findUnique({ where: { disputeResolutionId: resolutionId } });
    if (existing) {
      if (existing.paymentId !== paymentId || existing.amountVnd !== amount) throw new PermanentInboundError('Dispute refund replay contradicts existing refund');
      return;
    }
    const needsReview = async (failureCode: string) => this.outbox.enqueue(tx, {
      aggregateType: 'payment', aggregateId: paymentId,
      eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW,
      payload: { resolutionId, orderId, paymentId, failureCode },
    });
    if (adminUserId === payment.customerUserId) { await needsReview('APPROVER_IS_CUSTOMER'); return; }
    if (!['succeeded', 'partially_refunded'].includes(payment.status)) { await needsReview('PAYMENT_NOT_REFUNDABLE'); return; }
    const reserved = await tx.refund.aggregate({
      where: { paymentId, status: { in: ['pending', 'processing', 'needs_review', 'completed'] } },
      _sum: { amountVnd: true },
    });
    if (amount > payment.amount - (reserved._sum.amountVnd ?? 0n)) { await needsReview('REFUND_AMOUNT_EXCEEDS_REFUNDABLE'); return; }
    const now = new Date();
    const refund = await tx.refund.create({ data: {
      paymentId, disputeResolutionId: resolutionId, requestedByUserId: null,
      amountVnd: amount, reason: note.trim(), idempotencyKey: `dispute:${resolutionId}`,
      approvedByUserId: adminUserId, approvedAt: now, decisionNote: note.trim(),
      status: 'needs_review', failureReason: 'Awaiting funded Wallet refund confirmation',
    } });
    await this.audit.record(tx, { actorUserId: adminUserId, action: 'dispute.refund.approved', entityType: 'refund', entityId: refund.id,
      after: { resolutionId, paymentId, amountVnd: amount.toString(), status: refund.status }, reason: note.trim() });
  }

  async executeAfterInbox(raw: unknown): Promise<void> {
    let event;
    try { event = unwrapInboundEvent(raw); } catch { return; }
    if (event.data.action !== 'refund' || typeof event.data.resolutionId !== 'string') return;
    try {
      const refund = await this.database.client.refund.findUnique({ where: { disputeResolutionId: event.data.resolutionId } });
      if (refund) await this.refunds.execute(refund.id);
    } catch (error) {
      this.logger.warn(`Dispute refund execution deferred to reconciliation: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}
