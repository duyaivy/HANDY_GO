import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '@app/common';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: [
      'request',
      'matching',
      'bidding',
      'proposal',
      'order',
      'payment',
      'wallet',
      'system',
    ],
  })
  category!: string;

  @ApiProperty({})
  title!: string;

  @ApiProperty({})
  body!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  payload!: unknown;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class NotificationResponseDtoEnvelope extends ApiResponseDto<NotificationResponseDto> {
  @ApiProperty({ type: NotificationResponseDto })
  declare data: NotificationResponseDto;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class NotificationListDtoEnvelope extends ApiResponseDto<NotificationListDto> {
  @ApiProperty({ type: NotificationListDto })
  declare data: NotificationListDto;
}

export class UnreadCountDto {
  @ApiProperty({ minimum: 0 })
  count!: number;
}

export class UnreadCountDtoEnvelope extends ApiResponseDto<UnreadCountDto> {
  @ApiProperty({ type: UnreadCountDto })
  declare data: UnreadCountDto;
}

export class ReadAllDto {
  @ApiProperty({ minimum: 0 })
  updatedCount!: number;
}

export class ReadAllDtoEnvelope extends ApiResponseDto<ReadAllDto> {
  @ApiProperty({ type: ReadAllDto })
  declare data: ReadAllDto;
}
