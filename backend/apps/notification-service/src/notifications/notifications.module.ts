import { Module } from '@nestjs/common';
import { PreferencesModule } from '../preferences/preferences.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { PushModule } from '../push/push.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsRepository } from './notifications.repository.js';

@Module({
  imports: [PreferencesModule, DevicesModule, PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
