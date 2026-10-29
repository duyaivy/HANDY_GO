import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/wallet-client';

@Injectable()
export class WalletPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletPrismaService.name);

  constructor() {
    const explicitWalletUrl = process.env.DATABASE_URL_WALLET;
    const rawUrl = explicitWalletUrl || process.env.DATABASE_URL || 'postgresql://localhost:5432/handygo';
    let connectionString = rawUrl;
    let schema = 'wallet_service';

    try {
      const url = new URL(rawUrl);
      const configuredSchema = url.searchParams.get('schema');
      if (configuredSchema) schema = configuredSchema;
      else {
        url.searchParams.set('schema', schema);
        connectionString = url.toString();
      }
    } catch {
      // Prisma reports malformed URLs during connect.
    }

    super({ adapter: new PrismaPg({ connectionString }, { schema }) });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to wallet PostgreSQL');
    } catch (error) {
      this.logger.error(`Wallet database connection failed: ${(error as Error).message}`);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
