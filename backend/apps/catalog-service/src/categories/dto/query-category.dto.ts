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

  @ApiPropertyOptional({
    description:
      'If true, returns hierarchical nested category tree structure instead of flat list',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  tree?: boolean;
}
