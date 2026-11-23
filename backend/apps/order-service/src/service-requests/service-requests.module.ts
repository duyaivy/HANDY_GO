import { Module } from '@nestjs/common';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';
import { PricingEstimatorService } from './services/pricing-estimator.service.js';
import { OrderDeadlineSchedulerService } from './workers/order-deadline-scheduler.service.js';
import { BookingProposalsModule } from '../booking-proposals/booking-proposals.module.js';

@Module({
  imports: [BookingProposalsModule],
  controllers: [ServiceRequestsController],
  providers: [
    ServiceRequestsService,
    PricingEstimatorService,
    OrderDeadlineSchedulerService,
  ],
  exports: [
    ServiceRequestsService,
    PricingEstimatorService,
    OrderDeadlineSchedulerService,
  ],
})
export class ServiceRequestsModule {}
