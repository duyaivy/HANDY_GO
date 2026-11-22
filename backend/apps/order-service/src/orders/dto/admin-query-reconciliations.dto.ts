import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AdminQueryReconciliationsDto {
  @ApiPropertyOptional({
    enum: [
      'pending_reconciliation',
      'quarantined',
      'replayed',
      'reconciled_late',
    ],
  })
  @IsOptional()
  @IsIn([
    'pending_reconciliation',
    'quarantined',
    'replayed',
    'reconciled_late',
  ])
  status?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
