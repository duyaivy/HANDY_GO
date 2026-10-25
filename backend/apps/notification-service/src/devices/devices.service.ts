import { Injectable, NotFoundException } from '@nestjs/common';
import { DevicesRepository } from './devices.repository.js';
import type { RegisterDeviceDto } from './dto/register-device.dto.js';

@Injectable()
export class DevicesService {
  constructor(private readonly repository: DevicesRepository) {}

  register(userId: string, dto: RegisterDeviceDto) {
    return this.repository.register(userId, dto);
  }

  async deactivate(userId: string, id: string) {
    const { count } = await this.repository.deactivate(userId, id);
    if (!count) throw new NotFoundException('Device not found');
    return { id, isActive: false };
  }
}
