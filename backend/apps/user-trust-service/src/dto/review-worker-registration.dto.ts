import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewWorkerRegistrationDto {
  @ApiProperty({
    description: 'Quyết định duyệt hồ sơ đăng ký dịch vụ của thợ',
    enum: ['approved', 'rejected'],
    example: 'approved',
  })
  @IsIn(['approved', 'rejected'], {
    message: 'decision phải là "approved" hoặc "rejected"',
  })
  @IsNotEmpty({ message: 'Quyết định duyệt không được để trống' })
  decision!: 'approved' | 'rejected';

  @ApiPropertyOptional({
    description: 'Lý do từ chối (bắt buộc khi decision là "rejected")',
    example: 'Hình ảnh chứng chỉ bị mờ, không rõ thông tin thợ',
  })
  @ValidateIf((o) => o.decision === 'rejected')
  @IsNotEmpty({ message: 'Vui lòng cung cấp lý do từ chối' })
  @IsString({ message: 'Lý do từ chối phải là chuỗi ký tự' })
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Version của đơn đăng ký mà Admin đã xem trên màn hình (dùng để phát hiện xung đột dữ liệu đồng thời)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(1, { message: 'expectedVersion phải lớn hơn hoặc bằng 1' })
  expectedVersion?: number;
}

