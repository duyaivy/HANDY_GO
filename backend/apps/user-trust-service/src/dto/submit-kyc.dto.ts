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
  idDocumentType?: string;

  @ApiPropertyOptional({
    description: 'Số giấy tờ tùy thân (nếu có)',
    example: '012345678901',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idNumber?: string;

  @ApiPropertyOptional({
    description: 'URL hoặc tham chiếu ảnh mặt trước giấy tờ',
    example: 'https://res.cloudinary.com/.../front.jpg',
  })
  @IsOptional()
  @IsString()
  documentFrontRef?: string;

  @ApiPropertyOptional({
    description: 'URL hoặc tham chiếu ảnh mặt sau giấy tờ (nếu có)',
    example: 'https://res.cloudinary.com/.../back.jpg',
  })
  @IsOptional()
  @IsString()
  documentBackRef?: string;

  @ApiPropertyOptional({
    description: 'URL hoặc tham chiếu ảnh selfie khuôn mặt',
    example: 'https://res.cloudinary.com/.../selfie.jpg',
  })
  @IsOptional()
  @IsString()
  selfieRef?: string;
}
