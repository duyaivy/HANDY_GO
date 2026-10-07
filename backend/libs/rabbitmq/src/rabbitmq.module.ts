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
          urls: [
            process.env.RABBITMQ_URL ?? 'amqp://handygo:handygo@localhost:5672',
          ],
          queue: 'user-trust-service',
          queueOptions: {
            durable: true,
          },
          exchange: process.env.RABBITMQ_EXCHANGE ?? 'handy-go.events',
          exchangeType: 'topic',
          persistent: true,
        },
      },
    ]),
  ],
  providers: [RabbitMQService, RabbitMQContextService],
  exports: [RabbitMQService, RabbitMQContextService],
})
export class RabbitMQModule {}
 
export function createRabbitMQOptions(queue: string) {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://handygo:handygo@localhost:5672'],
      queue,
      noAck: false,
      queueOptions: {
        durable: true,
      },
    },
  };
}
