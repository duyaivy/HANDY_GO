import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PreferencesModule } from '../preferences/preferences.module.js';
import { EventConsumerService } from './event-consumer.service.js';
import { EventProcessorService } from './event-processor.service.js';
import { NotificationPolicy } from './notification-policy.js';
import { NotificationRouter } from './notification-router.js';

// AMQP feature: the consumer is the inbound adapter; there is no HTTP send endpoint.
@Module({
  imports: [NotificationsModule, PreferencesModule],
  providers: [
    EventConsumerService,
    EventProcessorService,
    NotificationPolicy,
    NotificationRouter,
  ],
})
export class EventsModule {}
