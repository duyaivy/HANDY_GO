import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListKycCasesDto {
  @ApiPropertyOptional({
    description: 'Lọc hồ sơ KYC theo trạng thái xác minh',
    enum: ['draft', 'submitted', 'reviewing', 'approved', 'rejected'],
    example: 'reviewing',
  })
  @IsOptional()
  @IsIn(['draft', 'submitted', 'reviewing', 'approved', 'rejected'], {
    message: 'Trạng thái KYC không hợp lệ',
  })
  status?: string;

  @ApiPropertyOptional({
    description: 'Số thứ tự trang phân trang (bắt đầu từ 1)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng hồ sơ tối đa trên mỗi trang',
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
