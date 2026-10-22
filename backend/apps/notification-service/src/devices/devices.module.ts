import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';
import { DevicesRepository } from './devices.repository.js';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, DevicesRepository],
  exports: [DevicesService, DevicesRepository],
})
export class DevicesModule {}
