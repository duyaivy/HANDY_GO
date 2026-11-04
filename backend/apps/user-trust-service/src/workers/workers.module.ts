import { Module } from '@nestjs/common';
import { UserTrustDatabaseModule } from '@app/database';
import { InternalServiceGuard } from '../common/guards/internal-service.guard.js';
import { WorkersController } from './workers.controller.js';
import { WorkersService } from './workers.service.js';

@Module({
  imports: [UserTrustDatabaseModule],
  controllers: [WorkersController],
  providers: [WorkersService, InternalServiceGuard],
})
export class WorkersModule {}
