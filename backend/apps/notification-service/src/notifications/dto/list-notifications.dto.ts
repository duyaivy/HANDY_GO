import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class ListNotificationsDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description:
      'Opaque nextCursor from the previous page. Reuse with the same read filter.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 1024)
  cursor?: string;

  @ApiPropertyOptional({
    description: 'true: read only; false: unread only; omitted: all',
    type: Boolean,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isRead?: boolean;
}
