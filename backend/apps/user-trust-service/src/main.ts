import { UserTrustServiceModule } from './user-trust-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions } from '@app/rabbitmq';

await bootstrapApplication(UserTrustServiceModule, {
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions('user-trust-service'));
  },
});
