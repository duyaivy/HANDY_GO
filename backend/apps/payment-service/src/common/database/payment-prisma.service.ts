import { HttpStatus, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/payment-client';
import { AppException, ERROR_CODES } from '@app/common';

@Injectable()
export class PaymentPrismaService implements OnModuleDestroy {
  private instance?: PrismaClient;

  get client(): PrismaClient {
    if (!this.instance) {
      const rawUrl = process.env.DATABASE_URL_PAYMENT || process.env.DATABASE_URL;
      if (!rawUrl) {
        throw new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          'Payment database is not configured',
        );
      }
      let url: URL;
      try {
        url = new URL(rawUrl);
        if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Unsupported protocol');
      } catch {
        throw new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          'Payment database URL is invalid',
        );
      }
      url.searchParams.set('schema', 'payment_service');
      this.instance = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema: 'payment_service' }),
      });
    }
    return this.instance;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.instance) await this.instance.$disconnect();
  }
}
