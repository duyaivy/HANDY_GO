import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { OrdersService } from './orders.service.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import { AdminGuard } from '../common/guards/admin.guard.js';

@Module({
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, TrustedGatewayGuard, AdminGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
