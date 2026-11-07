import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
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
}

