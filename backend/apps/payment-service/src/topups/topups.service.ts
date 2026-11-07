import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import type { Prisma } from '@prisma/payment-client';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { PermanentInboundError, requirePositiveInteger, requireUuid } from '../common/inbound/inbound-event.js';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import { topupSucceededEvent, type PaymentTx } from '../common/outbox/payment-events.js';
import { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';
import type { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import type { CreateTopupDto } from './dto/create-topup.dto.js';
import { TopupProvider } from './providers/topup-provider.js';

export const WALLET_TOPUP_CREDITED = 'wallet.topup.credited';
export const TOPUP_TTL_MS = 15 * 60_000;
const PENDING_STATUSES = ['pending', 'awaiting_payment'];

export const IPN_RESPONSE = {
  ok: { RspCode: '00', Message: 'Confirm Success' },
  notFound: { RspCode: '01', Message: 'Order not found' },
  alreadyConfirmed: { RspCode: '02', Message: 'Order already confirmed' },
  invalidAmount: { RspCode: '04', Message: 'Invalid amount' },
  invalidSignature: { RspCode: '97', Message: 'Invalid signature' },
  failure: { RspCode: '99', Message: 'Unknown error' },
} as const;
export type IpnResponse = (typeof IPN_RESPONSE)[keyof typeof IPN_RESPONSE];

const topupSelect = {
  id: true,
  amountVnd: true,
  pointsToCredit: true,
  provider: true,
  status: true,
  checkoutUrl: true,
  providerPaidAt: true,
  walletCreditedAt: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.TopupRequestSelect;
type TopupRecord = Prisma.TopupRequestGetPayload<{ select: typeof topupSelect }>;

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Top-up not found');
}

@Injectable()
export class TopupsService implements OnModuleInit {
  private readonly logger = new Logger(TopupsService.name);

  constructor(
    private readonly database: PaymentPrismaService,
    private readonly provider: TopupProvider,
    private readonly outbox: PaymentOutboxService,
    private readonly inbox: PaymentInboxService,
  ) {}

  onModuleInit(): void {
    this.inbox.register(WALLET_TOPUP_CREDITED, (data, tx) => this.onWalletCredited(data, tx));
  }

  private serialize(topup: TopupRecord) {
    return {
      id: topup.id,
      amountVnd: topup.amountVnd.toString(),
      pointsToCredit: topup.pointsToCredit.toString(),
      provider: topup.provider,
      status: topup.status,
      // The hosted checkout link is only useful while the payment can still be made.
      checkoutUrl: PENDING_STATUSES.includes(topup.status) ? topup.checkoutUrl : null,
      providerPaidAt: topup.providerPaidAt,
      walletCreditedAt: topup.walletCreditedAt,
      expiresAt: topup.expiresAt,
      createdAt: topup.createdAt,
    };
  }

  async create(userId: string, dto: CreateTopupDto, ipAddress: string) {
    if (!this.provider.isConfigured()) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODES.DEPENDENCY_UNAVAILABLE, 'Top-up provider is not configured');
    }
    const amountVnd = BigInt(dto.amountVnd);
    const existing = await this.database.client.topupRequest.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, select: { ...topupSelect, userId: true } });
    if (existing) return this.replay(existing, userId, amountVnd);

    const txnRef = `HG${Date.now().toString(36)}${randomBytes(6).toString('hex')}`.toUpperCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOPUP_TTL_MS);
    const checkoutUrl = this.provider.buildCheckoutUrl({
      txnRef,
      amountVnd,
      ipAddress,
      createdAt: now,
      expiresAt,
      orderInfo: `Nap Point ${txnRef}`,
    });
    try {
      const created = await this.database.client.topupRequest.create({
        data: {
          userId,
          amountVnd,
          pointsToCredit: amountVnd,
          provider: this.provider.name,
          status: 'awaiting_payment',
          idempotencyKey: dto.idempotencyKey,
          providerTransactionRef: txnRef,
          checkoutUrl,
          expiresAt,
          attempts: { create: { attemptNo: 1, provider: this.provider.name, providerTransactionRef: txnRef, checkoutUrl } },
        },
        select: topupSelect,
      });
      return this.serialize(created);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const raced = await this.database.client.topupRequest.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, select: { ...topupSelect, userId: true } });
      if (!raced) throw error;
      return this.replay(raced, userId, amountVnd);
    }
  }

  private replay(existing: TopupRecord & { userId: string }, userId: string, amountVnd: bigint) {
    if (existing.userId !== userId || existing.amountVnd !== amountVnd) {
      throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, 'Idempotency key was used for a different top-up');
    }
    return this.serialize(existing);
  }

  async get(userId: string, id: string) {
    const topup = await this.database.client.topupRequest.findFirst({ where: { id, userId }, select: topupSelect });
    if (!topup) throw notFound();
    return this.serialize(topup);
  }

  async list(userId: string, query: PaymentPaginationDto) {
    const where = { userId };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.topupRequest.findMany({
        where,
        select: topupSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.client.topupRequest.count({ where }),
    ]);
    return { items: items.map((item) => this.serialize(item)), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  // The provider callback is the only proof of payment; the return URL is never trusted.
  async handleIpn(query: Record<string, string>): Promise<IpnResponse> {
    const notification = this.provider.verifyNotification(query);
    if (!notification.signatureValid) {
      this.logger.warn('Rejected top-up IPN with an invalid signature');
      return IPN_RESPONSE.invalidSignature;
    }
    if (!notification.txnRef) return IPN_RESPONSE.notFound;
    const topup = await this.database.client.topupRequest.findUnique({ where: { providerTransactionRef: notification.txnRef } });
    if (!topup) return IPN_RESPONSE.notFound;
    if (notification.amountVnd !== topup.amountVnd) {
      await this.recordNotification(topup.id, notification, 'amount mismatch');
      return IPN_RESPONSE.invalidAmount;
    }

    return this.database.client.$transaction(async (tx) => {
      const marker = await tx.providerNotification.createMany({
        data: [this.notificationRow(topup.id, notification)],
        skipDuplicates: true,
      });
      if (marker.count === 0) return IPN_RESPONSE.alreadyConfirmed;
      await tx.$queryRaw`SELECT id FROM "payment_service"."topup_requests" WHERE id = ${topup.id}::uuid FOR UPDATE`;
      const current = await tx.topupRequest.findUniqueOrThrow({ where: { id: topup.id } });
      const now = new Date();
      let response: IpnResponse = IPN_RESPONSE.alreadyConfirmed;

      if (notification.success && ['pending', 'awaiting_payment', 'expired'].includes(current.status)) {
        const paid = await tx.topupRequest.update({
          where: { id: topup.id },
          data: { status: 'credit_pending', providerPaidAt: now, providerPaymentRef: notification.providerTransactionNo },
        });
        await tx.topupAttempt.updateMany({
          where: { providerTransactionRef: notification.txnRef!, status: { in: ['pending', 'processing'] } },
          data: { status: 'succeeded', finishedAt: now },
        });
        await this.outbox.enqueue(tx, topupSucceededEvent(paid));
        response = IPN_RESPONSE.ok;
      } else if (!notification.success && PENDING_STATUSES.includes(current.status)) {
        await tx.topupRequest.update({
          where: { id: topup.id },
          data: { status: 'failed', failureReason: `provider_code_${notification.responseCode}`.slice(0, 100) },
        });
        await tx.topupAttempt.updateMany({
          where: { providerTransactionRef: notification.txnRef!, status: { in: ['pending', 'processing'] } },
          data: { status: 'failed', finishedAt: now, failureReason: `provider_code_${notification.responseCode}`.slice(0, 100) },
        });
        response = IPN_RESPONSE.ok;
      }
      await tx.providerNotification.updateMany({
        where: { provider: this.provider.name, eventKey: notification.eventKey },
        data: { processedAt: now },
      });
      return response;
    });
  }

  private notificationRow(topupId: string, notification: ReturnType<TopupProvider['verifyNotification']>, processingError?: string) {
    return {
      provider: this.provider.name,
      eventKey: notification.eventKey,
      notificationType: 'topup_ipn',
      signatureValid: true,
      payload: notification.auditPayload as Prisma.InputJsonObject,
      relatedTopupId: topupId,
      ...(processingError ? { processingError } : {}),
    };
  }

  private async recordNotification(topupId: string, notification: ReturnType<TopupProvider['verifyNotification']>, error: string) {
    await this.database.client.providerNotification.createMany({
      data: [{ ...this.notificationRow(topupId, notification, error), processedAt: new Date() }],
      skipDuplicates: true,
    });
  }

  // Wallet ACK: only now is the top-up completed. A credit without provider evidence goes to review.
  async onWalletCredited(data: Record<string, unknown>, tx: PaymentTx): Promise<void> {
    const topupId = requireUuid(data, 'paymentId', 'topupId');
    const userId = requireUuid(data, 'userId');
    const amount = requirePositiveInteger(data, 'amount');
    const topup = await tx.topupRequest.findUnique({ where: { id: topupId } });
    if (!topup) throw new PermanentInboundError('wallet.topup.credited references an unknown top-up');
    if (topup.userId !== userId || topup.pointsToCredit !== amount) {
      throw new PermanentInboundError('wallet.topup.credited contradicts the top-up');
    }
    if (topup.status === 'completed') return;
    const verified = topup.providerPaidAt !== null && ['credit_pending', 'paid', 'needs_review'].includes(topup.status);
    await tx.topupRequest.updateMany({
      where: { id: topupId, status: topup.status },
      data: verified
        ? { status: 'completed', walletCreditedAt: new Date() }
        : { status: 'needs_review', walletCreditedAt: new Date(), failureReason: 'wallet_credit_without_provider_evidence' },
    });
  }

  // Reconciliation sweep: expire unpaid checkouts and surface credits that Wallet never acknowledged.
  async reconcile(now = new Date(), stuckAfterMs = 60 * 60_000): Promise<{ expired: number; flagged: number }> {
    const expired = await this.database.client.topupRequest.updateMany({
      where: { status: { in: ['pending', 'awaiting_payment'] }, expiresAt: { lt: now } },
      data: { status: 'expired' },
    });
    const flagged = await this.database.client.topupRequest.updateMany({
      where: { status: 'credit_pending', providerPaidAt: { lt: new Date(now.getTime() - stuckAfterMs) } },
      data: { status: 'needs_review', failureReason: 'wallet_ack_missing' },
    });
    return { expired: expired.count, flagged: flagged.count };
  }
}
