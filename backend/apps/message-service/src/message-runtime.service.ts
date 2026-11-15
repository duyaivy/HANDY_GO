import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { MessageBroker } from './broker.js';
import { IdentityService } from './identity.js';
import { MESSAGE_OPTIONS, type MessageAppOptions } from './message.options.js';
import { MessageService } from './message.service.js';
import { MessageRealtime } from './realtime.js';
import { RateLimits } from './security.js';

/** Owns resources attached outside Nest's HTTP adapter, including pre-init factory startup. */
@Injectable()
export class MessageRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageRuntimeService.name);
  private realtime?: MessageRealtime;
  private broker?: MessageBroker;
  private reconcile?: NodeJS.Timeout;
  private started = false;
  private closing?: Promise<void>;

  constructor(
    @Inject(MESSAGE_OPTIONS) private readonly options: MessageAppOptions,
    @Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(MessageService) private readonly messages: MessageService,
    @Inject(RateLimits) private readonly rates: RateLimits,
  ) {}

  onModuleInit() {
    return this.start();
  }

  async start() {
    if (this.started || this.closing) return;
    this.started = true;
    try {
      this.realtime = new MessageRealtime(
        this.adapter.httpAdapter.getHttpServer(),
        this.identity,
        this.messages,
        this.rates,
        this.options.origins,
      );
      if (this.options.brokerUrl) {
        this.broker = new MessageBroker(this.messages, this.options.brokerUrl);
        this.broker.start();
      }
      this.reconcile = setInterval(() => {
        void this.messages.reconcile().catch(() => {});
      }, 30000);
      this.reconcile.unref();
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  // Close Socket.IO before Nest closes HTTP: upgraded connections would otherwise
  // keep the HTTP adapter waiting. Do not throw and abort the remaining Nest hooks.
  onModuleDestroy() {
    return this.close();
  }

  close(): Promise<void> {
    this.closing ??= this.cleanup();
    return this.closing;
  }

  private async cleanup() {
    clearInterval(this.reconcile);
    for (const [resource, close] of [
      ['broker', () => this.broker?.close()],
      ['realtime', () => this.realtime?.close()],
      ['database', () => this.options.db.$disconnect()],
    ] as const) {
      try {
        await close();
      } catch {
        this.logger.error({ resource, errorCode: 'MESSAGE_CLEANUP_FAILED' });
      }
    }
  }
}
