import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import type { CommissionRule } from '@prisma/payment-client';
import { AdminAuditService } from '../common/audit/admin-audit.service.js';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { parseCommissionRate } from '../common/money/payment-money.js';
import { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import type { CreateCommissionRuleDto } from './dto/commission-rules.dto.js';

function bad(message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ERROR_CODES.VALIDATION_ERROR,
    message,
  );
}

function conflict(message: string): AppException {
  return new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, message);
}

function serialize(rule: CommissionRule) {
  return {
    id: rule.id,
    ratePercent: rule.ratePercent.toFixed(2),
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    isActive: rule.isActive,
    createdByUserId: rule.createdByUserId,
    description: rule.description,
    createdAt: rule.createdAt,
  };
}

/**
 * Admin management of versioned commission rules. A new rule only ever starts in the future, closes the
 * currently open rule at its start (`[effective_from, effective_to)`), and never rewrites history, so
 * existing payment snapshots are untouched. The database exclusion constraint is the final overlap guard.
 */
@Injectable()
export class CommissionRulesAdminService {
  constructor(
    private readonly database: PaymentPrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(query: PaymentPaginationDto) {
    const [items, total] = await this.database.client.$transaction([
      this.database.client.commissionRule.findMany({
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.client.commissionRule.count(),
    ]);
    return {
      items: items.map(serialize),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async create(
    actorUserId: string,
    dto: CreateCommissionRuleDto,
    now = new Date(),
  ) {
    let rate: string;
    try {
      rate = parseCommissionRate(dto.ratePercent).normalized;
    } catch (error) {
      throw bad(
        error instanceof RangeError ? error.message : 'Invalid commission rate',
      );
    }
    const effectiveFrom = new Date(dto.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime()))
      throw bad('effectiveFrom is not a valid timestamp');
    if (effectiveFrom.getTime() <= now.getTime())
      throw bad(
        'effectiveFrom must be in the future; rules are never retroactive',
      );

    try {
      return await this.database.client.$transaction(async (tx) => {
        // Serialize rule writers so the "latest rule" read below cannot race another Admin.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('payment_service.commission_rules'))::text`;
        const latest = await tx.commissionRule.findFirst({
          where: { isActive: true },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (
          latest &&
          effectiveFrom.getTime() <= latest.effectiveFrom.getTime()
        ) {
          throw conflict(
            'A commission rule already starts at or after this time',
          );
        }
        let closed: { id: string; previousEffectiveTo: string | null } | null =
          null;
        if (
          latest &&
          (!latest.effectiveTo ||
            latest.effectiveTo.getTime() > effectiveFrom.getTime())
        ) {
          await tx.commissionRule.update({
            where: { id: latest.id },
            data: { effectiveTo: effectiveFrom },
          });
          closed = {
            id: latest.id,
            previousEffectiveTo: latest.effectiveTo?.toISOString() ?? null,
          };
        }
        const created = await tx.commissionRule.create({
          data: {
            ratePercent: rate,
            effectiveFrom,
            createdByUserId: actorUserId,
            description: dto.description ?? null,
          },
        });
        await this.audit.record(tx, {
          actorUserId,
          action: 'commission_rule.created',
          entityType: 'commission_rule',
          entityId: created.id,
          before: closed,
          after: serialize(created),
          reason: dto.description ?? null,
        });
        return serialize(created);
      });
    } catch (error) {
      // PostgreSQL exclusion_violation (23P01) from commission_rules_no_overlap.
      if (
        JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})).includes(
          'commission_rules_no_overlap',
        )
      ) {
        throw conflict('Commission rule would overlap an existing rule');
      }
      throw error;
    }
  }
}
