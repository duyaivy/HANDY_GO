import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListUsersDto {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm (theo họ tên hoặc ID người dùng)',
    example: 'Nguyễn Văn',
  })
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc danh sách theo vai trò',
    enum: ['customer', 'worker', 'all'],
    example: 'worker',
  })
  @IsOptional()
  @IsIn(['customer', 'worker', 'all'], {
    message: 'Vai trò phải là customer, worker hoặc all',
  })
  role?: 'customer' | 'worker' | 'all';

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái tài khoản',
    enum: ['active', 'suspended', 'deleted'],
    example: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'], {
    message: 'Trạng thái người dùng không hợp lệ',
  })
  status?: 'active' | 'suspended' | 'deleted';

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
    description: 'Số lượng người dùng tối đa trên mỗi trang (1-100)',
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

