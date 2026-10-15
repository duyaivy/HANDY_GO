import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class RabbitMQService implements OnModuleDestroy {
  constructor(
    @Inject('RABBITMQ_CLIENT')
    private readonly client: ClientProxy,
  ) {}

  async emit<T>(pattern: string, data: T): Promise<void> {
    await this.client.emit(pattern, data).toPromise();
  }

  async send<TRequest, TResponse>(
    pattern: string,
    data: TRequest,
  ): Promise<TResponse> {
    return lastValueFrom(this.client.send<TResponse, TRequest>(pattern, data));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
