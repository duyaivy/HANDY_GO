import { Module } from '@nestjs/common';
import { UserTrustDatabaseModule } from '@app/database';
import { RabbitMQModule } from '@app/rabbitmq';
import { AuthModule } from '@app/auth';
import { CloudinaryModule } from '@app/cloudinary';
import { OutboxPublisherService, OutboxRepository } from '@app/common';
import { KycController } from './kyc.controller.js';
import { KycAdminController } from './kyc-admin.controller.js';
import { KycService } from './kyc.service.js';
import { KycWorkerService } from './kyc-worker.service.js';
import { KycRepository } from './kyc.repository.js';
import { UserTrustOutboxRepository } from './outbox/user-trust-outbox.repository.js';

@Module({
  imports: [UserTrustDatabaseModule, RabbitMQModule, AuthModule, CloudinaryModule],
  controllers: [KycController, KycAdminController],
  providers: [
    KycRepository,
    KycService,
    KycWorkerService,
    UserTrustOutboxRepository,
    {
      provide: OutboxRepository,
      useClass: UserTrustOutboxRepository,
    },
    OutboxPublisherService,
  ],
  exports: [KycService, KycWorkerService, KycRepository],
})
export class KycModule {}
