import { TrackingServiceModule } from './tracking-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';

await bootstrapApplication(TrackingServiceModule, {
  enableSwagger: true,
  swaggerTitle: 'HandyGo Tracking Service API - Quản lý Dòng thời gian & Tiến trình Nghiệp vụ',
  swaggerDescription:
    'Theo dõi toàn bộ tiến trình xuyên suốt Request -> Matching -> Bidding -> Proposal -> Order -> Payment dưới dạng dòng thời gian append-only',
  swaggerVersion: '1.0.0',
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions(RABBITMQ_QUEUES.TRACKING, 10));
  },
});
