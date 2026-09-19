import {
  Transport,
  type RmqOptions,
} from '@nestjs/microservices';

export function createRabbitMQOptions(
  queue: string,
): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [
        process.env.RABBITMQ_URL ??
          'amqp://handygo:handygo@localhost:5672',
      ],

      queue,

      queueOptions: {
        durable: true,
      },

      noAck: false, // consumer tự ACK sau khi business operation hoàn thành

      prefetchCount: 10, // giới hạn tối đa lượng message chưa ACK đang được giao, để kiểm soát reliability và overload

      exchange:
        process.env.RABBITMQ_EXCHANGE ??
        'handy-go.events',

      exchangeType: 'topic',

      wildcards: true,

      persistent: true,

      maxConnectionAttempts: -1,
    },
  };
}