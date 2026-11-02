import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewKycCaseDto {
  @ApiProperty({
    description: 'Quyết định phê duyệt của Admin: approved (duyệt) hoặc rejected (từ chối)',
    enum: ['approved', 'rejected'],
    example: 'approved',
  })
  @IsNotEmpty({ message: 'Quyết định duyệt KYC (decision) là bắt buộc' })
  @IsIn(['approved', 'rejected'], {
    message: 'Quyết định phải là approved hoặc rejected',
  })
  decision!: 'approved' | 'rejected';

  @ApiPropertyOptional({
    description: 'Ghi chú hoặc lý do phê duyệt / từ chối hồ sơ',
    example: 'Thông tin CCCD và ảnh khuôn mặt khớp hoàn toàn, đủ điều kiện làm Thợ.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
