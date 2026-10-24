import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/wallet-client';

@Injectable()
export class WalletPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletPrismaService.name);

  constructor() {
    const explicitWalletUrl = process.env.DATABASE_URL_WALLET;
    const connectionString = explicitWalletUrl || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/handygo';
    let walletConnectionString = connectionString;
    try {
      const url = new URL(connectionString);
      if (!explicitWalletUrl || !url.searchParams.has('schema')) url.searchParams.set('schema', 'wallet_service');
      walletConnectionString = url.toString();
    } catch { /* Prisma will report malformed URLs during connect. */ }
    super({ adapter: new PrismaPg({ connectionString: walletConnectionString }) });
  }

  async onModuleInit(): Promise<void> {
    try { await this.$connect(); this.logger.log('Connected to wallet PostgreSQL'); }
    catch (error) { this.logger.error(`Wallet database connection failed: ${(error as Error).message}`); throw error; }
  }

  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}
