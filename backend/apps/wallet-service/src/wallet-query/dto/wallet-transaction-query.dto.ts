import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class WalletTransactionQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Filter by transaction type' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ enum: ['pending', 'completed', 'failed', 'reversed'] })
  @IsIn(['pending', 'completed', 'failed', 'reversed'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
