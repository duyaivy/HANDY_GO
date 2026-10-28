import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/order-client';
import { IsCommaSeparatedEnum } from '../../common/validators/is-comma-separated-enum.validator.js';

export class QueryServiceRequestDto {
  @ApiPropertyOptional({
    description: 'Filter by request status (single or comma-separated)',
    example: 'open_for_bidding,draft,bidding_closed',
    enum: RequestStatus,
  })
  @IsOptional()
  @IsString({ message: 'status must be a string' })
  @IsCommaSeparatedEnum(RequestStatus)
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by service ID',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}
