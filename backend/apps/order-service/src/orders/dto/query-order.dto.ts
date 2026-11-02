import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/order-client';
import { IsCommaSeparatedEnum } from '../../common/validators/is-comma-separated-enum.validator.js';

export class QueryOrderDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter by Order Status (single or comma-separated)',
    example: 'created,confirmed,in_progress',
    enum: OrderStatus,
  })
  @IsOptional()
  @IsString({ message: 'status must be a string' })
  @IsCommaSeparatedEnum(OrderStatus)
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by Payment State',
    enum: ['unpaid', 'pending', 'paid', 'refunded', 'failed'],
  })
  @IsOptional()
  @IsEnum(['unpaid', 'pending', 'paid', 'refunded', 'failed'])
  paymentState?: string;
}
