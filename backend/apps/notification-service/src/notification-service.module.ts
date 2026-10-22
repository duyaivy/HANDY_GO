import { Module } from '@nestjs/common';
import { NotificationCommonModule } from './common/notification-common.module.js';
import { DevicesModule } from './devices/index.js';
import { NotificationsModule } from './notifications/index.js';
import { PreferencesModule } from './preferences/index.js';
import { HealthModule } from './health/health.module.js';
import { EventsModule } from './events/index.js';
import { PushModule } from './push/index.js';

@Module({
  imports: [
    NotificationCommonModule,
    DevicesModule,
    PreferencesModule,
    NotificationsModule,
    HealthModule,
    EventsModule,
    PushModule,
  ],
})
export class NotificationServiceModule {}
