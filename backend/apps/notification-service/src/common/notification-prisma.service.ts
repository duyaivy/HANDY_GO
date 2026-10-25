import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/notification-client';
import { resolveNotificationDatabaseUrl } from './notification-database.config.js';

@Injectable()
export class NotificationPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  readonly schema: string;

  constructor(config: ConfigService) {
    const connectionString = resolveNotificationDatabaseUrl(
      config.get<string>('DATABASE_URL_NOTIFICATION'),
      config.get<string>('DATABASE_URL'),
    );
    const url = new URL(connectionString);
    const schema = url.searchParams.get('schema') || 'notification_service';
    const adapter = new PrismaPg(
      { connectionString },
      { schema },
    );
    super({ adapter });
    this.schema = schema;
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      throw new Error('Notification database connection failed');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
