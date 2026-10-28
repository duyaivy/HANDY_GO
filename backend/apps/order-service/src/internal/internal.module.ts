import { Module } from '@nestjs/common';
import { InternalOrderController } from './internal-order.controller.js';
import { InternalOrderService } from './internal-order.service.js';
import { InternalSecretGuard } from './guards/internal-secret.guard.js';

@Module({
  controllers: [InternalOrderController],
  providers: [InternalOrderService, InternalSecretGuard],
  exports: [InternalOrderService],
})
export class InternalOrderModule {}
