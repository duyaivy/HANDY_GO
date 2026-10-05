import { ApiProperty } from '@nestjs/swagger';

export class UploadImageResponseDto {
  @ApiProperty({
    description: 'Cloudinary Asset ID',
    example: 'd84b2fa816e4564c78168270564ef729',
  })
  assetId!: string;

  @ApiProperty({
    description: 'Cloudinary Public ID',
    example: 'handy-go/images/sample_image',
  })
  publicId!: string;

  @ApiProperty({
    description: 'Secure URL dẫn tới hình ảnh',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1234567890/handy-go/images/sample_image.webp',
  })
  url!: string;

  @ApiProperty({
    description: 'Loại tài nguyên',
    example: 'image',
  })
  resourceType!: string;

  @ApiProperty({
    description: 'Định dạng hình ảnh',
    example: 'webp',
  })
  format!: string;

  @ApiProperty({
    description: 'Chiều rộng ảnh (px)',
    example: 1200,
  })
  width!: number;

  @ApiProperty({
    description: 'Chiều cao ảnh (px)',
    example: 800,
  })
  height!: number;

  @ApiProperty({
    description: 'Dung lượng file (bytes)',
    example: 123456,
  })
  bytes!: number;
}
