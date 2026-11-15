import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
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

export class PaymentQueryDto extends PaymentPaginationDto {
  @ApiPropertyOptional({ enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded'] })
  @IsOptional()
  @IsIn(['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded'])
  status?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'partially_refunded' | 'refunded';

  @ApiPropertyOptional({ enum: ['cash', 'point'] })
  @IsOptional()
  @IsIn(['cash', 'point'])
  method?: 'cash' | 'point';
}
