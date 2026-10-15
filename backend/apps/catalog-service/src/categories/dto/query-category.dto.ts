import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class QueryCategoryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter categories by parent UUID. Pass empty/null or omit to get all.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Parent ID must be a valid UUID v4' })
  parentId?: string;
}
