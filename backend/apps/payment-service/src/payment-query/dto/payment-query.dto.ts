import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentPaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 1000000, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;
}

export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;

export type PaymentStatusType = (typeof PAYMENT_STATUSES)[number];

export class PaymentQueryDto extends PaymentPaginationDto {
  @ApiPropertyOptional({
    enum: PAYMENT_STATUSES,
    isArray: true,
    description:
      'Lọc theo trạng thái thanh toán (hỗ trợ chọn nhiều, mảng hoặc phân cách bằng dấu phẩy)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) {
      return value
        .flatMap((item) => (typeof item === 'string' ? item.split(',') : item))
        .map((s) => (typeof s === 'string' ? s.trim() : s))
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [value];
  })
  @IsArray()
  @IsIn(PAYMENT_STATUSES, { each: true })
  status?: PaymentStatusType[];

  @ApiPropertyOptional({ enum: ['cash', 'point'] })
  @IsOptional()
  @IsIn(['cash', 'point'])
  method?: 'cash' | 'point';
}
