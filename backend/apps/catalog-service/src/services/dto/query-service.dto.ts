import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class QueryServiceDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter services by category UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID v4' })
  categoryId?: string;
}
