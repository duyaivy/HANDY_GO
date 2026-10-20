import { Module } from '@nestjs/common';
import { NotificationCommonModule } from './common/notification-common.module.js';
import { DevicesModule } from './devices/index.js';
import { NotificationsModule } from './notifications/index.js';
import { PreferencesModule } from './preferences/index.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    NotificationCommonModule,
    DevicesModule,
    PreferencesModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class NotificationServiceModule {}
