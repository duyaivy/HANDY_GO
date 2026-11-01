import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateOrderEvidenceDto {
  @ApiProperty({
    description: 'Media type',
    enum: ['image', 'video'],
    example: 'image',
  })
  @IsNotEmpty()
  @IsEnum(['image', 'video'], {
    message: 'mediaType must be either image or video',
  })
  mediaType: string;

  @ApiProperty({
    description: 'Cloudinary media URL uploaded via API Gateway',
    example: 'https://res.cloudinary.com/handygo/image/upload/v1234/evidence.jpg',
  })
  @IsNotEmpty()
  @IsUrl({}, { message: 'mediaUrl must be a valid URL' })
  mediaUrl: string;

  @ApiPropertyOptional({
    description: 'Optional note or description for this proof of work',
    example: 'Đã hoàn tất thay van khóa nước tổng',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
