import { optionalValue } from '../../../libs/config/src/optional-env.js';
import { MatchingServiceModule } from './matching-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';

const prefetchCount = parseInt(
  optionalValue(process.env.MATCHING_CONSUMER_PREFETCH) || '10',
  10,
);

await bootstrapApplication(MatchingServiceModule, {
  connectMicroservices: (app) => {
    app.connectMicroservice(
      createRabbitMQOptions(RABBITMQ_QUEUES.MATCHING, prefetchCount),
    );
  },
});
