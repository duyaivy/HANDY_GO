import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class InitVideoUploadDto {
  @ApiProperty({
    description: 'Tên file video gốc',
    example: 'demo.mp4',
  })
  @IsNotEmpty({ message: 'fileName không được để trống' })
  @IsString({ message: 'fileName phải là chuỗi ký tự' })
  fileName!: string;

  @ApiProperty({
    description: 'Tổng dung lượng file (tính theo bytes)',
    example: 734003200,
  })
  @IsNumber({}, { message: 'fileSize phải là số nguyên' })
  @Min(1, { message: 'fileSize phải lớn hơn 0' })
  fileSize!: number;

  @ApiProperty({
    description: 'MIME type của file video (video/mp4, video/quicktime, video/webm)',
    example: 'video/mp4',
  })
  @IsNotEmpty({ message: 'mimeType không được để trống' })
  @IsString({ message: 'mimeType phải là chuỗi ký tự' })
  mimeType!: string;

  @ApiPropertyOptional({
    description:
      'Checksum SHA-256 (64 ký tự hex) của nội dung video từ phía client (tùy chọn)',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  @IsOptional()
  @IsString({ message: 'checksumSha256 phải là chuỗi' })
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'checksumSha256 phải là chuỗi 64 ký tự hexadecimal hợp lệ',
  })
  checksumSha256?: string;
}
