import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryBidsDto {
  @ApiPropertyOptional({
    description: 'Lọc danh sách báo giá theo trạng thái',
    enum: ['active', 'withdrawn', 'expired', 'selected', 'rejected', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['active', 'withdrawn', 'expired', 'selected', 'rejected', 'all'])
  status?: string = 'all';

  @ApiPropertyOptional({
    description: 'Chỉ số trang (bắt đầu từ 1)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng phần tử trên mỗi trang',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
