import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitKycDto {
  @ApiPropertyOptional({
    description: 'Loại giấy tờ tùy thân',
    default: 'CCCD',
    example: 'CCCD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idDocumentType?: string = 'CCCD';

  @ApiPropertyOptional({
    description: 'Số CMND/CCCD (nếu có trước)',
    example: '012345678901',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idNumber?: string;

  @ApiPropertyOptional({
    description: 'URL hoặc đường dẫn ảnh mặt trước CCCD đã upload lên hệ thống storage (bỏ qua nếu upload file multipart)',
    example: 'https://res.cloudinary.com/handygo/image/upload/v1/kyc/front.jpg',
  })
  @IsOptional()
  @IsString()
  documentFrontRef?: string;

  @ApiPropertyOptional({
    description: 'URL hoặc đường dẫn ảnh mặt sau CCCD (tùy chọn)',
    example: 'https://res.cloudinary.com/handygo/image/upload/v1/kyc/back.jpg',
  })
  @IsOptional()
  @IsString()
  documentBackRef?: string;

  @ApiPropertyOptional({
    description: 'URL hoặc đường dẫn ảnh selfie khuôn mặt đã upload lên hệ thống storage (bỏ qua nếu upload file multipart)',
    example: 'https://res.cloudinary.com/handygo/image/upload/v1/kyc/selfie.jpg',
  })
  @IsOptional()
  @IsString()
  selfieRef?: string;

  @ApiPropertyOptional({
    description: 'Khóa idempotency để chống gửi trùng lặp yêu cầu',
    example: 'kyc-sub-550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
