import { UserTrustServiceModule } from './user-trust-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';

await bootstrapApplication(UserTrustServiceModule, {
  // Internal dashboard ranking sends counts, but receives at most five profiles.
  jsonBodyLimit: '16mb',
  connectMicroservices: (app) => {
    // Single queue connection with prefetchCount 1 for sequential AI processing without duplicate consumer
    app.connectMicroservice(
      createRabbitMQOptions(RABBITMQ_QUEUES.USER_TRUST, 1),
    );
  },
});
