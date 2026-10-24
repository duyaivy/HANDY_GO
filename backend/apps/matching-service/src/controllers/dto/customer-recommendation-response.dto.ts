import { ApiProperty } from '@nestjs/swagger';

export class RecommendedWorkerDto {
  @ApiProperty({ description: 'ID kết quả matching', example: 'd3b07384-d113-4c91-9e8a-02d6b38c227f' })
  matchResultId!: string;

  @ApiProperty({ description: 'ID tài khoản thợ (users.id)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  workerUserId!: string;

  @ApiProperty({ description: 'Thứ hạng đề xuất (1 đến 5)', example: 1 })
  rank!: number;

  @ApiProperty({ description: 'Điểm phù hợp tổng hợp (0.00 đến 100.00)', example: 92.5 })
  matchingScore!: number;
}

export class CustomerRecommendationResponseDto {
  @ApiProperty({ description: 'ID yêu cầu dịch vụ', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  requestId!: string;

  @ApiProperty({ description: 'Phiên bản revision của yêu cầu dịch vụ', example: 1 })
  requestRevision!: number;

  @ApiProperty({
    description: 'Trạng thái matching',
    enum: ['pending', 'processing', 'completed', 'failed'],
    example: 'completed',
  })
  status!: string;

  @ApiProperty({ description: 'Số lượng đề xuất hiển thị tối đa', example: 5 })
  displayLimit!: number;

  @ApiProperty({ description: 'Danh sách Top 5 thợ được đề xuất', type: [RecommendedWorkerDto] })
  recommendations!: RecommendedWorkerDto[];

  @ApiProperty({ description: 'Thời điểm tạo kết quả matching', example: '2026-10-25T00:30:00.000Z' })
  generatedAt?: string;

  @ApiProperty({ description: 'Phiên bản mô hình xếp hạng', example: 'mock-ai-v1.0' })
  modelVersion?: string;
}
