import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ReviseBidDto {
  @ApiProperty({
    description:
      'Số phiên bản hiện tại của báo giá để kiểm soát tranh chấp đồng thời (Optimistic Concurrency Control)',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({
    description: 'Mức giá báo mới sau khi điều chỉnh (VNĐ)',
    example: 220000,
    minimum: 1000,
    maximum: 9999999999,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Báo giá không được có quá 2 chữ số thập phân' },
  )
  @Min(1000, { message: 'Báo giá phải tối thiểu là 1,000 VND' })
  @Max(9999999999, { message: 'Báo giá không được vượt quá 9,999,999,999 VND' })
  amount?: number;

  @ApiPropertyOptional({
    description: 'Nội dung tin nhắn hoặc lý do điều chỉnh gửi đến khách hàng',
    example: 'Giảm giá 30k do đã khảo sát thực tế gần nhà.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    description: 'Thời điểm hết hạn hiệu lực mới của báo giá (chuỗi ISO 8601)',
    example: '2026-10-31T18:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
