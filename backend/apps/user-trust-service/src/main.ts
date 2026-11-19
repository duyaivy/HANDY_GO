import { UserTrustServiceModule } from './user-trust-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';
import { ConfigService } from '@app/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureDashboardRankingBodyParser } from './workers/dashboard-ranking-body-parser.js';

await bootstrapApplication(UserTrustServiceModule, {
  configure: (app) => {
    configureDashboardRankingBodyParser(
      app as NestExpressApplication,
      app.get(ConfigService).apiPrefix,
    );
  },
  connectMicroservices: (app) => {
    // Single queue connection with prefetchCount 1 for sequential AI processing without duplicate consumer
    app.connectMicroservice(
      createRabbitMQOptions(RABBITMQ_QUEUES.USER_TRUST, 1),
    );
  },
});
