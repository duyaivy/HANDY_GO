import { BiddingServiceModule } from './bidding-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';

await bootstrapApplication(BiddingServiceModule, {
  enableSwagger: true,
  swaggerTitle: 'HandyGo Bidding Service API - Quản lý Báo giá & Vòng Đấu thầu',
  swaggerDescription:
    'Tập hợp các API RESTful và RabbitMQ consumer quản lý phiên báo giá (bidding rounds) và báo giá của thợ (worker bids)',
  swaggerVersion: '1.0.0',
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions(RABBITMQ_QUEUES.BIDDING, 5));
  },
});
