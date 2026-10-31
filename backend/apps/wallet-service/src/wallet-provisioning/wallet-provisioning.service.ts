import { Injectable, OnModuleInit } from '@nestjs/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import crypto from 'node:crypto';
@Injectable()
export class WalletProvisioningService implements OnModuleInit {
  constructor(private readonly prisma: WalletPrismaService) {}
  async quarantine(event: unknown, reason: string, error?: unknown) {
    const payload = event && typeof event === 'object' ? event : { value: event };
    const eventId = event && typeof event === 'object' && typeof (event as { eventId?: unknown }).eventId === 'string'
      ? (event as { eventId: string }).eventId
      : `invalid-user-registered-${crypto.randomUUID()}`;
    return this.prisma.deadLetterEvent.upsert({
      where: { eventId },
      create: { eventId, eventType: 'user.registered', payload, reason, error: error instanceof Error ? error.message : undefined },
      update: { reason, error: error instanceof Error ? error.message : undefined },
    });
  }
  async onModuleInit() { await this.seedPlatformWallet(); }
  async provision(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.wallet.findUnique({ where: { userId } });
      const wallet = existing ?? await tx.wallet.create({ data: { userId } });
      if (!existing) await tx.outboxEvent.create({ data: { eventType: 'wallet.created', payload: { eventId: `wallet.created:${wallet.id}`, walletId: wallet.id, userId } } });
      return wallet;
    });
  }
  async provisionFromEvent(userId: string, eventId: string, eventType = 'user.registered') {
    return this.prisma.$transaction(async (tx) => {
      const processed = await tx.inboxEvent.findUnique({ where: { eventId } });
      if (processed) return tx.wallet.findUnique({ where: { userId } });
      const existing = await tx.wallet.findUnique({ where: { userId } });
      const wallet = existing ?? await tx.wallet.create({ data: { userId } });
      await tx.inboxEvent.create({ data: { eventId, eventType } });
      if (!existing) await tx.outboxEvent.create({ data: { eventType: 'wallet.created', payload: { eventId: `wallet.created:${wallet.id}`, walletId: wallet.id, userId } } });
      return wallet;
    }, { isolationLevel: 'Serializable' });
  }
  async seedPlatformWallet() { return this.prisma.wallet.upsert({ where: { systemKey: 'PLATFORM_FEES' }, create: { systemKey: 'PLATFORM_FEES' }, update: {} }); }
}
