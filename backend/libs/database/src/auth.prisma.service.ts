import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/auth-client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class AuthPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString =
      process.env.DATABASE_URL_AUTH ||
      'postgresql://postgres:postgres@localhost:5432/handy_auth';

    let schema: string | undefined;
    try {
      const url = new URL(connectionString);
      schema = url.searchParams.get('schema') || undefined;
    } catch {
      // ignore parsing error if custom format
    }

    const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      try {
        await this.$connect();
      } catch (error) {
        throw new Error(
          `AuthPrismaService failed to connect to database: ${(error as Error).message}`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
