import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/order-client';
import { IsCommaSeparatedEnum } from '../../common/validators/is-comma-separated-enum.validator.js';

export const PAYMENT_STATE_VALUES = [
  'unpaid',
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
] as const;

export const ORDER_PARTICIPANT_ROLE_VALUES = ['customer', 'worker'] as const;
export type OrderParticipantRole = (typeof ORDER_PARTICIPANT_ROLE_VALUES)[number];

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
    enum: PAYMENT_STATE_VALUES,
  })
  @IsOptional()
  @IsEnum(PAYMENT_STATE_VALUES)
  paymentState?: string;

  @ApiPropertyOptional({
    description: 'Filter orders by participant role: customer or worker',
    enum: ORDER_PARTICIPANT_ROLE_VALUES,
  })
  @IsOptional()
  @IsEnum(ORDER_PARTICIPANT_ROLE_VALUES)
  role?: OrderParticipantRole;

  @ApiPropertyOptional({
    description: 'Search orders by code, address, or agreed scope',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
