import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum DisputePreviousStatus {
  IN_PROGRESS = 'in_progress',
  AWAITING_CUSTOMER_CONFIRMATION = 'awaiting_customer_confirmation',
  COMPLETED = 'completed',
}

export enum DisputeSortBy {
  DISPUTED_AT = 'disputedAt',
  COMPLETED_AT = 'completedAt',
  CREATED_AT = 'createdAt',
  AGREED_PRICE = 'agreedPrice',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class AdminQueryDisputesDto {
  @ApiPropertyOptional({
    description: 'Page number, starting at 1',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({ description: 'Order code or dispute reason keyword' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Order status immediately before the dispute',
    enum: DisputePreviousStatus,
  })
  @IsOptional()
  @IsEnum(DisputePreviousStatus)
  previousStatus?: DisputePreviousStatus;

  @ApiPropertyOptional({
    description: 'Disputed on or after this ISO date/time',
  })
  @IsOptional()
  @IsDateString()
  disputedFrom?: string;

  @ApiPropertyOptional({
    description: 'Disputed on or before this ISO date/time',
  })
  @IsOptional()
  @IsDateString()
  disputedTo?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: DisputeSortBy,
    default: DisputeSortBy.DISPUTED_AT,
  })
  @IsOptional()
  @IsEnum(DisputeSortBy)
  sortBy: DisputeSortBy = DisputeSortBy.DISPUTED_AT;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}
