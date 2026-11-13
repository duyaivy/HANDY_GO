import {
  Body,
  ValidationPipe,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@app/config';
import { Public } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { SessionService } from '../common/session/session.service.js';
class ChatSessionInput {
  @IsUUID() accountId!: string;
  @IsUUID() userId!: string;
  @IsUUID() sid!: string;
}
@Controller('internal/auth')
export class ChatSessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}
  @Public()
  @Post('chat-session')
  @HttpCode(200)
  async inspect(
    @Body() rawInput: unknown,
    @Headers('x-internal-secret') secret?: string,
  ) {
    const expected = this.config.internalServiceSecret;
    if (
      !secret ||
      !expected ||
      Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    )
      throw new UnauthorizedException();
    // Object metatype leaves raw keys intact through the shared whitelist-only pipe.
    const input: ChatSessionInput = await new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }).transform(rawInput, { type: 'body', metatype: ChatSessionInput });
    return buildSuccessResponse(
      await this.sessions.inspectChatSession(input),
      'Session status',
    );
  }
}
