import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class WithdrawBidDto {
  @ApiPropertyOptional({
    description: 'Số phiên bản hiện tại của báo giá để khóa lạc quan chống xung đột',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({
    description: 'Lý do thợ rút lại báo giá',
    example: 'Đã kín lịch làm việc vào khung giờ này.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
