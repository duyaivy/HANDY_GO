import { databasePoolConfig, databasePoolError, runtimeDatabaseUrl } from './pool.config.js';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/auth-client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class AuthPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  public readonly schema: string;

  constructor() {
    const rawUrl = runtimeDatabaseUrl('auth', 'postgresql://postgres:postgres@localhost:5432/handygo?schema=auth_service');

    let connectionString = rawUrl;
    let schema = 'auth_service';

    try {
      const url = new URL(rawUrl);
      const urlSchema = url.searchParams.get('schema');
      if (urlSchema) {
        schema = urlSchema;
      } else {
        url.searchParams.set('schema', schema);
        connectionString = url.toString();
      }
    } catch {
      // ignore custom parsing error
    }

    const adapter = new PrismaPg(databasePoolConfig(connectionString, 'auth'), { schema, onPoolError: databasePoolError('auth') });
    super({ adapter });

    this.schema = schema;
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
