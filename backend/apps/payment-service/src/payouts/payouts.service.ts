import { ConflictException, ForbiddenException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Payout, Prisma } from '@prisma/payment-client';
import { WalletClient } from '../common/clients/wallet.client.js';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { PermanentInboundError, requirePositiveInteger, requireUuid } from '../common/inbound/inbound-event.js';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import type { PaymentTx } from '../common/outbox/payment-events.js';
import { BankSnapshotProvider, PayoutProvider } from './payout-provider.js';

export const WALLET_WITHDRAWAL_REQUESTED = 'wallet.withdrawal.requested';
const UNRESOLVED_SNAPSHOT = { state: 'unresolved' } as const;
const INTERRUPTED_AFTER_MS = 5 * 60_000;

function isResolved(snapshot: unknown): snapshot is Record<string, unknown> {
  return !!snapshot && typeof snapshot === 'object' && (snapshot as { state?: unknown }).state === 'resolved';
}

/**
 * Payout orchestration. Wallet owns the withdrawal and its hold: Payment records the payout, claims it
 * in Wallet BEFORE dispatching, and reports the final result. Anything uncertain keeps the hold and
 * goes to `needs_review`; a payout is never dispatched twice.
 */
@Injectable()
export class PayoutsService implements OnModuleInit {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly database: PaymentPrismaService,
    private readonly wallet: WalletClient,
    private readonly provider: PayoutProvider,
    private readonly snapshots: BankSnapshotProvider,
    private readonly inbox: PaymentInboxService,
  ) {}

  onModuleInit(): void {
    this.inbox.register(WALLET_WITHDRAWAL_REQUESTED, (data, tx) => this.onWithdrawalRequested(data, tx));
  }

  // Stores the payout before any dispatch; replays of the same withdrawal are no-ops.
  async onWithdrawalRequested(data: Record<string, unknown>, tx: PaymentTx): Promise<void> {
    const withdrawalId = requireUuid(data, 'withdrawalId');
    const payoutOperationId = requireUuid(data, 'payoutOperationId');
    const userId = requireUuid(data, 'userId');
    const bankAccountId = requireUuid(data, 'bankAccountId');
    const amountVnd = requirePositiveInteger(data, 'amount');

    const existing = await tx.payout.findUnique({ where: { withdrawalId } });
    if (existing) {
      if (existing.userId !== userId || existing.amountVnd !== amountVnd || existing.payoutOperationId !== payoutOperationId) {
        throw new PermanentInboundError('wallet.withdrawal.requested contradicts the stored payout');
      }
      return;
    }
    await tx.payout.create({
      data: {
        withdrawalId,
        payoutOperationId,
        userId,
        bankAccountId,
        bankAccountSnapshot: UNRESOLVED_SNAPSHOT,
        amountVnd,
        provider: this.provider.name,
        isSimulated: this.provider.simulated,
        idempotencyKey: `payout:${withdrawalId}`,
      },
    });
  }

  async processBatch(limit = 10): Promise<number> {
    const pending = await this.database.client.payout.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: limit });
    for (const payout of pending) await this.advance(payout);

    const processing = await this.database.client.payout.findMany({ where: { status: 'processing' }, orderBy: { createdAt: 'asc' }, take: limit });
    for (const payout of processing) await this.resumeProcessing(payout);
    return pending.length + processing.length;
  }

  /** Explicit operator resolution for the simulated provider. Never sends another payout. */
  async resolveSandbox(id: string, status: 'succeeded' | 'failed', actor: string, reason: string) {
    if (!reason.trim()) throw new ConflictException('Resolution reason is required');
    if (process.env.NODE_ENV === 'production' || !this.provider.simulated || this.provider.name !== 'mock' || !this.provider.isEnabled())
      throw new ForbiddenException('Sandbox mock payout resolution is disabled');
    await this.database.client.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM payment_service.payouts WHERE id = ${id}::uuid FOR UPDATE`;
      const payout = await tx.payout.findUnique({ where: { id } });
      if (!payout || payout.userId === actor || !payout.isSimulated || payout.provider !== 'mock')
        throw new ForbiddenException('An independent Admin must resolve a simulated payout');
      const attempt = await tx.payoutAttempt.findFirst({ where: { payoutId: id }, orderBy: { attemptNo: 'desc' } });
      if (!attempt || payout.status !== 'needs_review' || !['provider_outcome_unknown', 'dispatch_interrupted'].includes(payout.failureReason ?? ''))
        throw new ConflictException('Payout has no uncertain simulated dispatch to resolve');
      await tx.payoutAttempt.update({ where: { id: attempt.id }, data: {
        status, completedAt: new Date(), providerReference: status === 'succeeded' ? `MOCK-RESOLVED-${id}` : null,
        failureReason: status === 'failed' ? 'Simulated payout manually resolved as failed' : null,
      } });
      await tx.payout.update({ where: { id }, data: { status: 'processing', failureReason: null } });
      await tx.adminAuditLog.create({ data: { actorUserId: actor, action: 'payout.mock_resolved', entityType: 'payout', entityId: id,
        reason, beforeState: { status: payout.status, reason: payout.failureReason }, afterState: { status, provider: 'mock', isSimulated: true } } });
    });
    await this.reportToWallet(id);
    const row = await this.database.client.payout.findUniqueOrThrow({ where: { id } });
    return { id: row.id, status: row.status, provider: row.provider, isSimulated: row.isSimulated, amountVnd: row.amountVnd.toString() };
  }

  private async hold(payout: Payout, reason: string): Promise<void> {
    if (payout.failureReason !== reason) {
      await this.database.client.payout.updateMany({ where: { id: payout.id, status: payout.status }, data: { failureReason: reason } });
    }
  }

  private async review(payout: Payout, reason: string): Promise<void> {
    this.logger.error(`Payout ${payout.id} needs review: ${reason}`);
    await this.database.client.payout.updateMany({
      where: { id: payout.id, status: { in: ['pending', 'processing'] } },
      data: { status: 'needs_review', failureReason: reason },
    });
  }

  async advance(payout: Payout): Promise<void> {
    if (!this.provider.isEnabled()) return this.hold(payout, 'payout_provider_disabled');

    let snapshot: Record<string, unknown> | null = isResolved(payout.bankAccountSnapshot) ? (payout.bankAccountSnapshot as Record<string, unknown>) : null;
    if (!snapshot) {
      const fetched = await this.snapshots.fetch(payout.userId, payout.bankAccountId).catch(() => null);
      if (!fetched) return this.hold(payout, 'bank_snapshot_unavailable');
      snapshot = { ...fetched, state: 'resolved' };
      await this.database.client.payout.update({ where: { id: payout.id }, data: { bankAccountSnapshot: snapshot as Prisma.InputJsonObject } });
    }

    // Claim first: from here the user can no longer cancel and the hold stays until a final result.
    const claim = await this.wallet.claimWithdrawal(payout.withdrawalId, {
      payoutOperationId: payout.payoutOperationId ?? '',
      payoutReference: `payout:${payout.id}`,
    });
    if (claim.outcome === 'unknown') return this.hold(payout, 'wallet_claim_unavailable');
    if (claim.outcome === 'rejected') return this.review(payout, `wallet_claim_rejected_${claim.status}`);
    if (claim.data.id !== payout.withdrawalId || claim.data.payoutOperationId !== payout.payoutOperationId || claim.data.status !== 'processing')
      return this.hold(payout, 'wallet_claim_not_confirmed');

    const attempt = await this.database.client.$transaction(async (tx) => {
      const moved = await tx.payout.updateMany({
        where: { id: payout.id, status: 'pending' },
        data: { status: 'processing', processingAt: new Date(), failureReason: null },
      });
      if (moved.count === 0) return null;
      const max = await tx.payoutAttempt.aggregate({ where: { payoutId: payout.id }, _max: { attemptNo: true } });
      return tx.payoutAttempt.create({
        data: { payoutId: payout.id, attemptNo: (max._max.attemptNo ?? 0) + 1, provider: this.provider.name, status: 'processing' },
      });
    });
    if (!attempt) return;

    const result = await this.provider.send({ payoutId: payout.id, amountVnd: payout.amountVnd, bankAccountSnapshot: snapshot });
    if (result.outcome === 'unknown') {
      // Never retry blindly: the transfer may have happened. The hold stays until someone reconciles it.
      return this.review(payout, 'provider_outcome_unknown');
    }
    await this.database.client.payoutAttempt.update({
      where: { id: attempt.id },
      data:
        result.outcome === 'succeeded'
          ? { status: 'succeeded', providerReference: result.reference, completedAt: new Date() }
          : { status: 'failed', failureReason: result.reason.slice(0, 200), completedAt: new Date() },
    });
    await this.reportToWallet(payout.id);
  }

  // Re-runs the Wallet notification (idempotent on payoutOperationId) for payouts whose provider result is final.
  private async resumeProcessing(payout: Payout): Promise<void> {
    const attempt = await this.database.client.payoutAttempt.findFirst({ where: { payoutId: payout.id }, orderBy: { attemptNo: 'desc' } });
    if (attempt && ['succeeded', 'failed'].includes(attempt.status)) return void (await this.reportToWallet(payout.id));
    const started = payout.processingAt?.getTime() ?? 0;
    if (Date.now() - started > INTERRUPTED_AFTER_MS) await this.review(payout, 'dispatch_interrupted');
  }

  private async reportToWallet(payoutId: string): Promise<void> {
    const payout = await this.database.client.payout.findUnique({ where: { id: payoutId } });
    const attempt = await this.database.client.payoutAttempt.findFirst({ where: { payoutId }, orderBy: { attemptNo: 'desc' } });
    if (!payout || payout.status !== 'processing' || !attempt || !['succeeded', 'failed'].includes(attempt.status)) return;
    const succeeded = attempt.status === 'succeeded';
    const result = await this.wallet.finishWithdrawal(payout.withdrawalId, {
      payoutOperationId: payout.payoutOperationId ?? '',
      status: succeeded ? 'succeeded' : 'failed',
    });
    if (result.outcome === 'unknown') return; // retried by the next sweep
    if (result.outcome === 'rejected') return this.review(payout, `wallet_finish_rejected_${result.status}`);
    if (result.data.id !== payout.withdrawalId || result.data.payoutOperationId !== payout.payoutOperationId || result.data.status !== (succeeded ? 'succeeded' : 'failed'))
      return this.review(payout, 'wallet_finish_not_confirmed');
    await this.database.client.payout.updateMany({
      where: { id: payoutId, status: 'processing' },
      data: succeeded
        ? { status: 'completed', completedAt: new Date(), providerReference: attempt.providerReference, failureReason: null }
        : { status: 'failed', completedAt: new Date(), failureReason: attempt.failureReason },
    });
  }
}
