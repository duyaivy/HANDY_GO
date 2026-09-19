import { Injectable } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';

@Injectable()
export class RabbitMQContextService {
  ack(context: RmqContext): void {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    channel.ack(message);
  }

  nack(
    context: RmqContext,
    requeue = true,
  ): void {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    channel.nack(message, false, requeue);
  }
}

// yêu cầu acknowledgement trên cùng channel với delivery. 
// Khi manual ACK được bật, message chỉ nên ACK sau khi xử lý xong; 
// nếu consumer mất kết nối trước ACK, broker có thể redeliver message.