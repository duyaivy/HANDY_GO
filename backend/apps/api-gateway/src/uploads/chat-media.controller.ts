import {
  Body,
  ValidationPipe,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsIn, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
import { CloudinaryService } from '@app/cloudinary';
import { ConfigService } from '@app/config';
import { buildSuccessResponse } from '@app/common';
class VerifyChatMediaInput {
  @IsString() @MaxLength(512) @Matches(/^[A-Za-z0-9_/-]+$/) storageKey!: string;
  @IsUUID() ownerId!: string;
  @IsIn(['IMAGE', 'VIDEO']) mediaType!: 'IMAGE' | 'VIDEO';
}
/** Service-only endpoint. GatewayAuthMiddleware excludes this exact POST; this handler authenticates the caller. */
@Controller('internal/media/chat')
export class ChatMediaController {
  constructor(
    private readonly media: CloudinaryService,
    private readonly config: ConfigService,
  ) {}
  @Post('verify')
  @HttpCode(200)
  async verify(
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
    const input: VerifyChatMediaInput = await new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }).transform(rawInput, { type: 'body', metatype: VerifyChatMediaInput });
    return buildSuccessResponse(
      await this.media.verifyChatMedia(input),
      'Verified chat media',
    );
  }
}
