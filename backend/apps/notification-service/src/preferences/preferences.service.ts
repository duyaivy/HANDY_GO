import { Injectable, BadRequestException } from '@nestjs/common';
import { PreferencesRepository } from './preferences.repository.js';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto.js';

@Injectable()
export class PreferencesService {
  constructor(private readonly repository: PreferencesRepository) {}

  async get(userId: string) {
    return (
      (await this.repository.find(userId)) ?? {
        pushEnabled: true,
        inAppEnabled: true,
        emailEnabled: false,
      }
    );
  }

  update(userId: string, dto: UpdatePreferencesDto) {
    if (
      [dto.pushEnabled, dto.inAppEnabled, dto.emailEnabled].every(
        (value) => value === undefined,
      )
    ) {
      throw new BadRequestException(
        'At least one notification channel is required',
      );
    }
    return this.repository.update(userId, dto);
  }
}
