import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentPaginationDto } from '../../payment-query/dto/payment-query.dto.js';

export class CreateRefundDto {
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amount!: string;

  @IsString()
  @Length(1, 150)
  idempotencyKey!: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class DecideRefundDto {
  @IsBoolean()
  approve!: boolean;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export const REFUND_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'needs_review',
] as const;

export type RefundStatusType = (typeof REFUND_STATUSES)[number];

export class AdminRefundQueryDto extends PaymentPaginationDto {
  @ApiPropertyOptional({ enum: REFUND_STATUSES })
  @IsOptional()
  @IsIn(REFUND_STATUSES)
  status?: RefundStatusType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentId?: string;
}

