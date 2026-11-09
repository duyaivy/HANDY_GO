import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListWorkerRegistrationsDto {
  @ApiPropertyOptional({
    description: 'Số trang (mặc định: 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số bản ghi trên mỗi trang (mặc định: 10, tối đa: 100)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái duyệt',
    enum: ['pending', 'approved', 'rejected'],
    example: 'pending',
  })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'], {
    message: 'status phải là một trong: pending, approved, rejected',
  })
  status?: 'pending' | 'approved' | 'rejected';

  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm theo tên thợ, địa chỉ làm việc hoặc dịch vụ',
    example: 'Nguyễn Văn A',
  })
  @IsOptional()
  @IsString({ message: 'search phải là chuỗi ký tự' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Sắp xếp theo thời gian nộp đơn',
    enum: ['newest', 'oldest'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest'], {
    message: 'sortBy phải là "newest" hoặc "oldest"',
  })
  sortBy?: 'newest' | 'oldest' = 'newest';
}

