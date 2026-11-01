import { ApiProperty } from '@nestjs/swagger';

export class InternalRankedWorkerDto {
  @ApiProperty({ description: 'ID kết quả matching', example: 'd3b07384-d113-4c91-9e8a-02d6b38c227f' })
  matchResultId!: string;

  @ApiProperty({ description: 'ID tài khoản thợ (users.id)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  workerUserId!: string;

  @ApiProperty({ description: 'Thứ hạng xếp hạng (1 đến 20)', example: 1 })
  rank!: number;

  @ApiProperty({ description: 'Điểm phù hợp tổng hợp (0.00 đến 100.00)', example: 92.5 })
  matchingScore!: number;

  @ApiProperty({
    description: 'Chi tiết điểm thành phần',
    example: {
      semanticScore: 88.5,
      geoScore: 95.0,
      ratingScore: 92.0,
      experienceScore: 80.0,
      completionScore: 90.0,
    },
    required: false,
  })
  scoreBreakdown?: Record<string, any>;
}

export class InternalRecommendationResponseDto {
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

  @ApiProperty({ description: 'Tổng số ứng viên eligible được đánh giá', example: 15 })
  candidateCount!: number;

  @ApiProperty({ description: 'Số lượng ứng viên được lưu trữ (tối đa 20)', example: 15 })
  resultCount!: number;

  @ApiProperty({ description: 'Danh sách Top 20 thợ được xếp hạng', type: [InternalRankedWorkerDto] })
  recommendations!: InternalRankedWorkerDto[];

  @ApiProperty({ description: 'Thời điểm tạo kết quả', example: '2026-10-25T00:30:00.000Z' })
  generatedAt?: string;

  @ApiProperty({ description: 'Phiên bản mô hình xếp hạng', example: 'mock-ai-v1.0' })
  modelVersion?: string;
}
