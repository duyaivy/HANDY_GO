import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RabbitMQService } from './rabbitmq.service.js';
import { RabbitMQContextService } from './rabbitmq.context.js';

@Global()
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'RABBITMQ_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL ?? 'amqp://handygo:handygo@localhost:5672'],
          queue: 'handy-go-publisher',
          queueOptions: {
            durable: true,
          },
          persistent: true,
        },
      },
    ]),
  ],
  providers: [RabbitMQService, RabbitMQContextService],
  exports: [RabbitMQService, RabbitMQContextService],
})
export class RabbitMQModule {}