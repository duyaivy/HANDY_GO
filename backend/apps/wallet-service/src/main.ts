import { WalletServiceModule } from './wallet-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions } from '@app/rabbitmq';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor.js';

await bootstrapApplication(WalletServiceModule, {
  setupApp: (app) => {
    app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  },
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions('wallet-service-events'));
  },
});
