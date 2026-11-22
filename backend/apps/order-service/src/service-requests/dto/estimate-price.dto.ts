import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class EstimatePriceDto {
  @ApiProperty({
    description: 'UUID của dịch vụ trong catalog',
    example: '123e4567-e89b-42d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'serviceId is required' })
  @IsUUID('4', { message: 'serviceId must be a valid UUID v4' })
  serviceId!: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết tình trạng sự cố hoặc yêu cầu của khách hàng',
    example: 'Máy lạnh bị chảy nước nhỏ giọt ướt hết sàn',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  description?: string;
}

export class EstimatePriceResponseDto {
  @ApiProperty({ example: 200000, description: 'Giá sàn ước tính tham khảo (VND)' })
  aiRefPriceMin!: number;

  @ApiProperty({ example: 350000, description: 'Giá trần ước tính tham khảo (VND)' })
  aiRefPriceMax!: number;

  @ApiPropertyOptional({
    example: 'Máy lạnh chảy nước, nghẹt ống thoát nước',
    description: 'Trường hợp sự cố benchmark khớp được',
  })
  matchedReason?: string;

  @ApiProperty({
    example: false,
    description: 'True nếu hệ thống sử dụng mức giá cơ sở fallback',
  })
  isFallback!: boolean;
}
