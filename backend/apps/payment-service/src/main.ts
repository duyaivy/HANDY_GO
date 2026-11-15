import { PaymentServiceModule } from './payment-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';

await bootstrapApplication(PaymentServiceModule, {
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions(RABBITMQ_QUEUES.PAYMENT, 10));
  },
});
