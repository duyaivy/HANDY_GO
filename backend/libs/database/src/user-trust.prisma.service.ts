import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/user-trust-client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class UserTrustPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString =
      process.env.DATABASE_URL_USER_TRUST ||
      'postgresql://postgres:postgres@localhost:5433/handy_user_trust';
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      try {
        await this.$connect();
      } catch (error) {
        throw new Error(
          `UserTrustPrismaService failed to connect to database: ${(error as Error).message}`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
