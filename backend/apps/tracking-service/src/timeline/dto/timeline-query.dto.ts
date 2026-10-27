import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TrackingEntityType } from '@prisma/tracking-client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class TimelineQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo loại đối tượng (entity_type)',
    enum: TrackingEntityType,
  })
  @IsOptional()
  @IsEnum(TrackingEntityType)
  entityType?: TrackingEntityType;
}
