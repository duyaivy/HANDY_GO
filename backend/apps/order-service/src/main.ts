import { OrderServiceModule } from './order-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';

await bootstrapApplication(OrderServiceModule, {
  enableSwagger: true,
  swaggerTitle: 'HandyGo Order Service API',
  swaggerDescription:
    'Tập hợp các API RESTful và RabbitMQ consumer quản lý Yêu cầu dịch vụ, Booking Proposals và Đơn hàng',
  swaggerVersion: '1.0.0',
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions(RABBITMQ_QUEUES.ORDER, 10));
  },
});
