import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WalletProvisioningService } from './wallet-provisioning.service.js';
@Controller()
export class WalletProvisioningConsumer {
  constructor(private readonly service: WalletProvisioningService) {}
  @EventPattern('user.created') async onUserCreated(@Payload() event: { eventId?: string; userId?: string; id?: string }) {
    const userId = event.userId ?? event.id;
    if (!userId) throw new Error('user.created event must include userId');
    await this.service.provisionFromEvent(userId, event.eventId ?? `user.created:${userId}`);
  }
}
