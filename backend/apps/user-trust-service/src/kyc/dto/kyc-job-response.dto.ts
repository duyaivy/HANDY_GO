import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KycJobStatusResponseDto {
  @ApiProperty({ description: 'ID của công việc phân tích AI' })
  jobId!: string;

  @ApiProperty({ description: 'ID của hồ sơ KYC' })
  kycCaseId!: string;

  @ApiProperty({
    description: 'Trạng thái xử lý công việc AI: pending, processing, completed, failed',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status!: string;

  @ApiProperty({ description: 'Số lần đã thử lại khi gặp lỗi' })
  retryCount!: number;

  @ApiPropertyOptional({ description: 'Lý do lỗi nếu xử lý thất bại' })
  failureReason?: string | null;

  @ApiPropertyOptional({ description: 'Tóm tắt kết quả phân tích AI' })
  aiResult?: Record<string, any> | null;

  @ApiPropertyOptional({ description: 'Thời điểm bắt đầu xử lý' })
  startedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Thời điểm hoàn tất xử lý' })
  completedAt?: Date | null;

  @ApiProperty({ description: 'Thời điểm tạo job' })
  createdAt!: Date;
}
