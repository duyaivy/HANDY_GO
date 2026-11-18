import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListWorkerReviewsDto {
  @ApiPropertyOptional({
    description: 'Lọc nhận xét theo số sao (1-5)',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số sao đánh giá phải là số nguyên' })
  @Min(1, { message: 'Số sao tối thiểu là 1' })
  @Max(5, { message: 'Số sao tối đa là 5' })
  rating?: number;

  @ApiPropertyOptional({
    description: 'Chỉ lấy những đánh giá có hình ảnh hoặc video thực tế',
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'hasMedia phải là giá trị boolean (true/false)' })
  hasMedia?: boolean;

  @ApiPropertyOptional({
    description:
      'Tiêu chí sắp xếp: newest (mới nhất), highest_rating (sao cao nhất), lowest_rating (sao thấp nhất), oldest (cũ nhất)',
    enum: ['newest', 'highest_rating', 'lowest_rating', 'oldest'],
    default: 'newest',
    example: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'highest_rating', 'lowest_rating', 'oldest'], {
    message:
      'sortBy phải là một trong các giá trị: newest, highest_rating, lowest_rating, oldest',
  })
  sortBy?: 'newest' | 'highest_rating' | 'lowest_rating' | 'oldest' = 'newest';

  @ApiPropertyOptional({
    description: 'Số thứ tự trang phân trang (bắt đầu từ 1)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số thứ tự trang phải là số nguyên' })
  @Min(1, { message: 'Số trang tối thiểu là 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng nhận xét tối đa trên mỗi trang',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng trên trang phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  @Max(50, { message: 'Số lượng tối đa là 50' })
  limit?: number = 10;
}
