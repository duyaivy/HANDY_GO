import { WalletServiceModule } from './wallet-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions } from '@app/rabbitmq';

await bootstrapApplication(WalletServiceModule, {
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions('wallet-service-events'));
  },
});
