import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';
import { LoggerModule } from '../../../libs/logger/src/logger.module.js';
import { AuthorityClient } from './authority.js';
import { ChatExceptionFilter } from './chat-exception.filter.js';
import { IdentityService } from './identity.js';
import { MessageController } from './message.controller.js';
import { MESSAGE_OPTIONS, type MessageAppOptions } from './message.options.js';
import { MessageRuntimeService } from './message-runtime.service.js';
import { MessageService } from './message.service.js';
import { MessagePrisma } from './persistence.js';
import { CursorCodec, RateLimits } from './security.js';

@Module({})
export class MessageModule {
  static register(options: MessageAppOptions): DynamicModule {
    return {
      module: MessageModule,
      imports: [LoggerModule.forRoot('message-service')],
      controllers: [MessageController],
      providers: [
        { provide: MESSAGE_OPTIONS, useValue: options },
        {
          provide: MessagePrisma,
          useFactory: (config: MessageAppOptions) => config.db,
          inject: [MESSAGE_OPTIONS],
        },
        {
          provide: AuthorityClient,
          useFactory: (config: MessageAppOptions) => config.authority,
          inject: [MESSAGE_OPTIONS],
        },
        {
          provide: TokenVerifierService,
          useFactory: (config: MessageAppOptions) => config.verifier,
          inject: [MESSAGE_OPTIONS],
        },
        {
          provide: CursorCodec,
          useFactory: (config: MessageAppOptions) =>
            new CursorCodec(config.cursorSecret),
          inject: [MESSAGE_OPTIONS],
        },
        { provide: RateLimits, useFactory: () => new RateLimits() },
        {
          provide: IdentityService,
          useFactory: (
            verifier: TokenVerifierService,
            authority: AuthorityClient,
          ) => new IdentityService(verifier, authority),
          inject: [TokenVerifierService, AuthorityClient],
        },
        {
          provide: MessageService,
          useFactory: (
            db: MessagePrisma,
            authority: AuthorityClient,
            cursor: CursorCodec,
          ) => new MessageService(db, authority, cursor),
          inject: [MessagePrisma, AuthorityClient, CursorCodec],
        },
        MessageRuntimeService,
        ChatExceptionFilter,
        { provide: APP_FILTER, useExisting: ChatExceptionFilter },
      ],
      exports: [MessageService, IdentityService, RateLimits, CursorCodec],
    };
  }
}
