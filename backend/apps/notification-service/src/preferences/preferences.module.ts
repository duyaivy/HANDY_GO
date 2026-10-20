import { Module } from '@nestjs/common';
import { PreferencesController } from './preferences.controller.js';
import { PreferencesService } from './preferences.service.js';
import { PreferencesRepository } from './preferences.repository.js';

@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService, PreferencesRepository],
  exports: [PreferencesService, PreferencesRepository],
})
export class PreferencesModule {}
