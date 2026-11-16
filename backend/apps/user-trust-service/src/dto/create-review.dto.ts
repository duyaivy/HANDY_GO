import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateReviewMediaDto {
  @ApiProperty({
    description: 'Loại media: image (hình ảnh) hoặc video',
    enum: ['image', 'video'],
    example: 'image',
  })
  @IsNotEmpty({ message: 'mediaType không được để trống' })
  @IsIn(['image', 'video', 'IMAGE', 'VIDEO'], {
    message: 'mediaType phải là image hoặc video',
  })
  mediaType: 'image' | 'video' | 'IMAGE' | 'VIDEO';

  @ApiProperty({
    description: 'URL của file media (Cloudinary hoặc link trực tiếp)',
    example: 'https://res.cloudinary.com/handygo/image/upload/v1/reviews/review1.jpg',
  })
  @IsNotEmpty({ message: 'mediaUrl không được để trống' })
  @IsUrl({}, { message: 'mediaUrl phải là URL hợp lệ' })
  mediaUrl: string;

  @ApiPropertyOptional({
    description: 'URL ảnh thumbnail cho video (nếu có)',
    example: 'https://res.cloudinary.com/handygo/image/upload/v1/reviews/thumb.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'thumbnailUrl phải là URL hợp lệ' })
  thumbnailUrl?: string;
}

export class CreateReviewDto {
  @ApiPropertyOptional({
    description: 'ID đơn hàng cần đánh giá (UUID). Nếu truyền trên đường dẫn URL thì trường này không bắt buộc.',
    example: 'a0000000-0000-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'orderId phải là định dạng UUID v4' })
  orderId?: string;

  @ApiPropertyOptional({
    description: 'ID người dùng thợ được đánh giá',
    example: '1377604f-84e3-46d7-bae2-0c1c862bd021',
  })
  @IsOptional()
  @IsUUID('4', { message: 'workerUserId phải là định dạng UUID v4' })
  workerUserId?: string;

  @ApiProperty({
    description: 'Số sao đánh giá tổng thể (từ 1 đến 5 sao)',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsNotEmpty({ message: 'Số sao đánh giá không được để trống' })
  @Type(() => Number)
  @IsInt({ message: 'Số sao đánh giá phải là số nguyên' })
  @Min(1, { message: 'Số sao đánh giá tối thiểu là 1 sao' })
  @Max(5, { message: 'Số sao đánh giá tối đa là 5 sao' })
  rating: number;

  @ApiPropertyOptional({
    description: 'Nội dung nhận xét, mô tả chi tiết trải nghiệm dịch vụ',
    example: 'Thợ đến đúng giờ, làm việc cẩn thận, nhiệt tình và chuyên nghiệp.',
  })
  @IsOptional()
  @IsString({ message: 'Nội dung nhận xét phải là chuỗi ký tự' })
  comment?: string;

  @ApiPropertyOptional({
    description: 'Đánh giá thái độ phục vụ (good, neutral, bad)',
    example: 'good',
    enum: ['good', 'neutral', 'bad'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['good', 'neutral', 'bad'], {
    message: 'attitudeRating phải là good, neutral hoặc bad',
  })
  attitudeRating?: string;

  @ApiPropertyOptional({
    description: 'Đánh giá chất lượng dịch vụ (good, neutral, bad)',
    example: 'good',
    enum: ['good', 'neutral', 'bad'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['good', 'neutral', 'bad'], {
    message: 'qualityRating phải là good, neutral hoặc bad',
  })
  qualityRating?: string;

  @ApiPropertyOptional({
    description: 'Đánh giá tốc độ hoàn thành (good, neutral, bad)',
    example: 'good',
    enum: ['good', 'neutral', 'bad'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['good', 'neutral', 'bad'], {
    message: 'speedRating phải là good, neutral hoặc bad',
  })
  speedRating?: string;

  @ApiPropertyOptional({
    description: 'Danh sách hình ảnh / video đính kèm đánh giá (tối đa 6)',
    type: [CreateReviewMediaDto],
  })
  @IsOptional()
  @IsArray({ message: 'media phải là một mảng' })
  @ArrayMaxSize(6, { message: 'Chỉ được đính kèm tối đa 6 hình ảnh hoặc video' })
  @ValidateNested({ each: true })
  @Type(() => CreateReviewMediaDto)
  media?: CreateReviewMediaDto[];
}

export class UpdateReviewDto {
  @ApiPropertyOptional({
    description: 'Số sao đánh giá tổng thể (từ 1 đến 5 sao)',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số sao đánh giá phải là số nguyên' })
  @Min(1, { message: 'Số sao đánh giá tối thiểu là 1 sao' })
  @Max(5, { message: 'Số sao đánh giá tối đa là 5 sao' })
  rating?: number;

  @ApiPropertyOptional({
    description: 'Nội dung nhận xét, mô tả chi tiết trải nghiệm dịch vụ',
    example: 'Thợ đến đúng giờ, làm việc cẩn thận, nhiệt tình và chuyên nghiệp.',
  })
  @IsOptional()
  @IsString({ message: 'Nội dung nhận xét phải là chuỗi ký tự' })
  comment?: string;

  @ApiPropertyOptional({
    description: 'Đánh giá thái độ phục vụ (good, neutral, bad)',
    example: 'good',
    enum: ['good', 'neutral', 'bad'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['good', 'neutral', 'bad'], {
    message: 'attitudeRating phải là good, neutral hoặc bad',
  })
  attitudeRating?: string;

  @ApiPropertyOptional({
    description: 'Đánh giá chất lượng dịch vụ (good, neutral, bad)',
    example: 'good',
    enum: ['good', 'neutral', 'bad'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['good', 'neutral', 'bad'], {
    message: 'qualityRating phải là good, neutral hoặc bad',
  })
  qualityRating?: string;

  @ApiPropertyOptional({
    description: 'Đánh giá tốc độ hoàn thành (good, neutral, bad)',
    example: 'good',
    enum: ['good', 'neutral', 'bad'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['good', 'neutral', 'bad'], {
    message: 'speedRating phải là good, neutral hoặc bad',
  })
  speedRating?: string;

  @ApiPropertyOptional({
    description: 'Danh sách hình ảnh / video đính kèm đánh giá (tối đa 6)',
    type: [CreateReviewMediaDto],
  })
  @IsOptional()
  @IsArray({ message: 'media phải là một mảng' })
  @ArrayMaxSize(6, { message: 'Chỉ được đính kèm tối đa 6 hình ảnh hoặc video' })
  @ValidateNested({ each: true })
  @Type(() => CreateReviewMediaDto)
  media?: CreateReviewMediaDto[];
}

