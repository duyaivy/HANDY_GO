import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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
    description: 'Từ khóa tìm kiếm theo tên thợ hoặc mã hồ sơ KYC',
    example: 'Nguyễn Văn A',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sắp xếp theo thời gian nộp hoặc tạo hồ sơ (mới nhất hoặc cũ nhất)',
    enum: ['newest', 'oldest'],
    default: 'newest',
    example: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest'], {
    message: 'Thứ tự sắp xếp phải là newest hoặc oldest',
  })
  sortBy?: 'newest' | 'oldest' = 'newest';

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
