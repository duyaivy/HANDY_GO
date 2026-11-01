import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { QueryOrderDto } from './query-order.dto.js';

export class AdminQueryOrderDto extends QueryOrderDto {
  @ApiPropertyOptional({ description: 'Filter by Customer User UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'customerUserId must be a valid UUID' })
  customerUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by Worker User UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'workerUserId must be a valid UUID' })
  workerUserId?: string;
}
