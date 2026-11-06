import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  Res,
  Inject,
  Module,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';
import { LoggerModule } from '../../../libs/logger/src/logger.module.js';
import { Logger } from 'nestjs-pino';
import type {
  ConversationListQuery,
  MessageListQuery,
} from '../../../libs/common/src/message-contracts/index.js';
import { MessagePrisma } from './persistence.js';
import { AuthorityClient } from './authority.js';
import { IdentityService } from './identity.js';
import { MessageService } from './message.service.js';
import { MessageRealtime } from './realtime.js';
import {
  ChatError,
  CursorCodec,
  publicError,
  RateLimits,
  validateInput,
} from './security.js';
import { MessageBroker } from './broker.js';
interface AppOptions {
  db: MessagePrisma;
  authority: AuthorityClient;
  verifier: TokenVerifierService;
  cursorSecret: string;
  origins: string[];
  brokerUrl?: string;
}
@Catch()
class ChatExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const e =
      (error as { type?: string })?.type === 'entity.too.large'
        ? new ChatError('PAYLOAD_TOO_LARGE')
        : publicError(error);
    if (e.retryAfterMs)
      response.setHeader('Retry-After', Math.ceil(e.retryAfterMs / 1000));
    response
      .status(e.status)
      .json({
        statusCode: e.status,
        message: e.code,
        data: null,
        code: e.code,
      });
  }
}
@Controller()
class ChatController {
  constructor(
    @Inject(MessageService) private readonly messages: MessageService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(RateLimits) private readonly rates: RateLimits,
  ) {}
  private async user(req: Request) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ChatError('UNAUTHORIZED');
    return (await this.identity.authenticate(header.slice(7))).userId;
  }
  private query(query: Record<string, unknown>) {
    if (query.limit !== undefined) {
      if (
        typeof query.limit !== 'string' ||
        !/^(?:[1-9]|[1-9][0-9]|100)$/.test(query.limit)
      )
        throw new ChatError('VALIDATION_ERROR');
      return { ...query, limit: Number(query.limit) };
    }
    return query;
  }
  private envelope(data: unknown, statusCode = 200) {
    return { statusCode, message: 'Success', data };
  }
  @Get('health') async health() {
    await this.messages.db.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'message-service' };
  }
  @Post('api/v1/conversations') async create(
    @Req() req: Request,
    @Body() body: { bidId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.user(req);
    this.rates.take(`create:${user}`, 20, 60000);
    const result = await this.messages.create(user, body);
    const status = result.created ? 201 : 200;
    res.status(status);
    return this.envelope(result.conversation, status);
  }
  @Get('api/v1/conversations') async list(
    @Req() req: Request,
    @Query() query: Record<string, unknown>,
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    return this.envelope(
      await this.messages.list(
        user,
        this.query(query) as ConversationListQuery,
      ),
    );
  }
  @Get('api/v1/conversations/:id') async get(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    return this.envelope(await this.messages.get(user, id));
  }
  @Get('api/v1/conversations/:id/messages') async history(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    return this.envelope(
      await this.messages.history(
        user,
        id,
        this.query(query) as MessageListQuery,
      ),
    );
  }
  @Patch('api/v1/conversations/:id/read') async read(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { lastReadSequence: string },
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    if (!body || Object.keys(body).some((k) => k !== 'lastReadSequence'))
      throw new ChatError('VALIDATION_ERROR');
    validateInput('message.read', { conversationId: id, ...body });
    return this.envelope(
      await this.messages.read(user, id, body.lastReadSequence),
    );
  }
}
export async function createMessageApp(options: AppOptions) {
  let shutdown=async()=>{};
  const identity = new IdentityService(options.verifier, options.authority),
    messages = new MessageService(
      options.db,
      options.authority,
      new CursorCodec(options.cursorSecret),
    ),
    rates = new RateLimits();
  @Module({
    imports: [LoggerModule.forRoot('message-service')],
    controllers: [ChatController],
    providers: [
      {provide:'MESSAGE_LIFECYCLE',useValue:{onApplicationShutdown:()=>shutdown()}},
      { provide: MessageService, useValue: messages },
      { provide: IdentityService, useValue: identity },
      { provide: RateLimits, useValue: rates },
    ],
  })
  class MessageModule {}
  const app = await NestFactory.create<NestExpressApplication>(MessageModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  app.useBodyParser('json', { limit: '16kb', strict: true });
  app.useGlobalFilters(new ChatExceptionFilter());
  app.enableShutdownHooks();
  app.enableCors({ origin: options.origins, credentials: true });
  const realtime = new MessageRealtime(
    app.getHttpServer(),
    identity,
    messages,
    rates,
    options.origins,
  );
  const broker = options.brokerUrl
    ? new MessageBroker(messages, options.brokerUrl)
    : undefined;
  broker?.start();
  const reconcile = setInterval(() => {
    void messages.reconcile().catch(() => {});
  }, 30000);
  reconcile.unref();
  shutdown = async () => {
    clearInterval(reconcile);
    await broker?.close();
    await realtime.close();
    await options.db.$disconnect();
  };
  return app;
}
