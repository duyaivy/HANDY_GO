import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitBidDto {
  @ApiProperty({
    description: 'Mức giá đề xuất của thợ cho yêu cầu dịch vụ (VNĐ)',
    example: 250000,
    minimum: 1000,
    maximum: 9999999999,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Báo giá không được có quá 2 chữ số thập phân' },
  )
  @Min(1000, { message: 'Báo giá phải tối thiểu là 1,000 VND' })
  @Max(9999999999, { message: 'Báo giá không được vượt quá 9,999,999,999 VND' })
  amount!: number;

  @ApiPropertyOptional({
    description: 'Ghi chú, giải thích phạm vi công việc hoặc cam kết bảo hành của thợ',
    example: 'Báo giá trọn gói bao gồm vật tư cơ bản và bảo hành 30 ngày.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    description: 'Thời điểm hết hạn hiệu lực của báo giá (chuỗi ISO 8601)',
    example: '2026-10-30T12:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
