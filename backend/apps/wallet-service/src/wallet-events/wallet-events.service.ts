import { Injectable } from '@nestjs/common';
import { OutboxPublisherService } from '@app/common';
@Injectable()
export class WalletEventsService {
  constructor(private readonly publisher: OutboxPublisherService) {}
  publishPending() { return this.publisher.publishPendingEvents(); }
}
