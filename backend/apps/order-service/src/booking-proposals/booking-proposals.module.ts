import { Module } from '@nestjs/common';
import { BookingProposalsController } from './booking-proposals.controller.js';
import { BookingProposalsService } from './booking-proposals.service.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [OrdersModule],
  controllers: [BookingProposalsController],
  providers: [BookingProposalsService],
  exports: [BookingProposalsService],
})
export class BookingProposalsModule {}
