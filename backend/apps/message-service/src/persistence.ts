import { PrismaClient } from '@prisma/message-client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  databasePoolConfig,
  databasePoolError,
} from '../../../libs/database/src/pool.config.js';

export class MessagePrisma extends PrismaClient {
  constructor(url = process.env.DATABASE_URL_MESSAGE?.trim()) {
    if (!url) throw new Error('DATABASE_URL_MESSAGE is required');
    super({
      adapter: new PrismaPg(databasePoolConfig(url, 'message'), {
        schema: 'message',
        onPoolError: databasePoolError('message'),
      }),
    });
  }
}
