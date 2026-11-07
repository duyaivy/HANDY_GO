import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAuditService } from '../common/audit/admin-audit.service.js';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import type { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';

@Injectable()
export class PaymentOperationsService {
  constructor(
    private readonly database: PaymentPrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async deadLetters(query: PaymentPaginationDto) {
    const where = { status: 'dead' };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.failedInboundEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        // Payload may contain private data. Operators only receive metadata here.
        select: {
          eventId: true,
          eventType: true,
          attempts: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.database.client.failedInboundEvent.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async replay(actor: string, eventId: string, reason: string) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT event_id FROM payment_service.failed_inbound_events WHERE event_id = ${eventId} FOR UPDATE`;
      const row = await tx.failedInboundEvent.findUnique({
        where: { eventId },
      });
      if (!row) throw new NotFoundException('Dead letter not found');
      if (row.status !== 'dead')
        throw new ConflictException(
          'Only dead events can be scheduled for replay',
        );
      if (await tx.consumedEvent.findUnique({ where: { eventId } }))
        throw new ConflictException('Event was already consumed');
      await tx.failedInboundEvent.update({
        where: { eventId },
        data: { status: 'retrying', attempts: 0, nextRetryAt: new Date() },
      });
      await this.audit.record(tx, {
        actorUserId: actor,
        action: 'inbound.replay_scheduled',
        entityType: 'inbound_event',
        entityId: eventId,
        before: { status: row.status, attempts: row.attempts },
        after: { status: 'retrying', attempts: 0 },
        reason,
      });
      // Normal inbox retry owns execution, preserving the original event ID and payload.
      return { eventId, status: 'retrying' };
    });
  }

  async dailyReport(now = new Date()) {
    // Vietnam calendar day; UTC Date is the storage representation of the day, not local midnight.
    const reportDate = new Date(
      `${new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10)}T00:00:00Z`,
    );
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('payment_service.daily_report'))::text`;
      const existing = await tx.dailyReconciliationReport.findUnique({
        where: { reportDate },
      });
      if (existing) return existing;
      const [
        processingPayments,
        stuckTopups,
        reviewRefunds,
        reviewPayouts,
        deadEvents,
      ] = await Promise.all([
        tx.payment.count({ where: { status: 'processing' } }),
        tx.topupRequest.count({
          where: { status: { in: ['credit_pending', 'needs_review'] } },
        }),
        tx.refund.count({
          where: { status: { in: ['processing', 'needs_review'] } },
        }),
        tx.payout.count({
          where: { status: { in: ['processing', 'needs_review'] } },
        }),
        tx.failedInboundEvent.count({ where: { status: 'dead' } }),
      ]);
      const summary = {
        scope: 'payment_local_unresolved_snapshot',
        walletLedgerCompared: false,
        processingPayments,
        stuckTopups,
        reviewRefunds,
        reviewPayouts,
        deadEvents,
      };
      return tx.dailyReconciliationReport.create({
        data: {
          reportDate,
          summary,
          discrepancyCount:
            processingPayments +
            stuckTopups +
            reviewRefunds +
            reviewPayouts +
            deadEvents,
        },
      });
    });
  }

  reports(query: PaymentPaginationDto) {
    return this.database.client.dailyReconciliationReport.findMany({
      orderBy: { reportDate: 'desc' },
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });
  }
}
