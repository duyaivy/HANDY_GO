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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  ConversationListQuery,
  MessageListQuery,
} from '../../../libs/common/src/message-contracts/index.js';
import { IdentityService } from './identity.js';
import { MessageService } from './message.service.js';
import { ChatError, RateLimits, validateInput } from './security.js';
@Controller()
export class MessageController {
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
