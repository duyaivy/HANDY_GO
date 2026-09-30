import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/postgres';
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL successfully');
    } catch (error) {
      this.logger.warn(
        `Could not connect to PostgreSQL on startup: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }
}
