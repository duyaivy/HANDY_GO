import {
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateBy,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceRequestMediaDto {
  @ApiProperty({
    description: 'Direct CDN/Cloudinary URL of uploaded media',
    example: 'https://res.cloudinary.com/handygo/image/upload/v1/req/photo1.webp',
  })
  @ValidateBy({
    name: 'isProjectCloudinaryUrl',
    validator: {
      validate(value: unknown): boolean {
        if (typeof value !== 'string') return false;
        try {
          const url = new URL(value);
          const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
          const segments = url.pathname.split('/').filter(Boolean);
          return Boolean(cloudName && url.protocol === 'https:' && url.hostname === 'res.cloudinary.com'
            && !url.port && !url.username && !url.password
            && segments[0] === cloudName && ['image', 'video'].includes(segments[1])
            && segments[2] === 'upload' && segments.length > 3);
        } catch {
          return false;
        }
      },
      defaultMessage: () => 'mediaUrl phải là URL HTTPS Cloudinary của dự án',
    },
  })
  @IsString()
  @IsNotEmpty()
  mediaUrl: string;

  @ApiProperty({
    description: 'Type of media: image or video',
    example: 'image',
  })
  @IsString()
  @IsNotEmpty()
  mediaType: string;
}

export class CreateServiceRequestDto {
  @ApiPropertyOptional({
    description: 'ID of the requested service from Catalog',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the problem or task',
    example: 'Sửa đường ống nước bị rò rỉ dưới bồn rửa chén',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Desired appointment datetime (ISO 8601)',
    example: '2026-10-25T14:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'AI reference minimum price',
    example: 150000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aiRefPriceMin?: number;

  @ApiPropertyOptional({
    description: 'AI reference maximum price',
    example: 300000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aiRefPriceMax?: number;

  @ApiPropertyOptional({
    description: 'Service execution address string',
    example: '123 Nguyễn Lương Bằng, Phường Hòa Khánh Bắc, Quận Liên Chiểu, Đà Nẵng',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string;

  @ApiPropertyOptional({
    description: 'GPS Latitude',
    example: 16.0748,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'GPS Longitude',
    example: 108.1499,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Media items (images/videos) uploaded via Gateway',
    type: [ServiceRequestMediaDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceRequestMediaDto)
  media?: ServiceRequestMediaDto[];
}
