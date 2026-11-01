import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/order-client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  public readonly schema: string;

  constructor() {
    const rawUrl =
      process.env.DATABASE_URL_ORDER ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/handygo?schema=order_service';

    let connectionString = rawUrl;
    let schema = 'order_service';

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

    const adapter = new PrismaPg({ connectionString }, { schema });
    super({ adapter });
    this.schema = schema;
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      try {
        await this.$connect();
        this.logger.log('Connected to PostgreSQL (order_service) successfully');
      } catch (error) {
        this.logger.warn(
          `Could not connect to PostgreSQL on startup: ${(error as Error).message}`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL (order_service)');
  }
}

export { PrismaService as OrderPrismaService };
