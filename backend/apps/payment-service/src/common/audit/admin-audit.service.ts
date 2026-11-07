import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/payment-client';
import { PaymentPrismaService } from '../database/payment-prisma.service.js';
import type { PaymentTx } from '../outbox/payment-events.js';

export interface AdminAuditEntry {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

// Audit rows are JSON: normalize Dates/BigInts into plain JSON values.
export function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  ) as Prisma.InputJsonValue;
}

/** Append-only audit trail of Admin actions: who, what, before/after, why and when. */
@Injectable()
export class AdminAuditService {
  constructor(private readonly database: PaymentPrismaService) {}

  // Call inside the transaction that performs the action so the audit row commits with it.
  async record(
    tx: PaymentTx | undefined,
    entry: AdminAuditEntry,
  ): Promise<void> {
    await (tx ?? this.database.client).adminAuditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeState: toAuditJson(entry.before),
        afterState: toAuditJson(entry.after),
        reason: entry.reason ?? null,
      },
    });
  }
}
