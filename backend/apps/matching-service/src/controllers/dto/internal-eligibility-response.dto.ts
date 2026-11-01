import { ApiProperty } from '@nestjs/swagger';

export class InternalEligibilityResponseDto {
  @ApiProperty({ description: 'ID kết quả matching được kiểm tra', example: 'd3b07384-d113-4c91-9e8a-02d6b38c227f' })
  matchResultId!: string;

  @ApiProperty({ description: 'Kết quả kiểm tra tính hợp lệ của đề xuất', example: true })
  isEligible!: boolean;

  @ApiProperty({
    description: 'Lý do không hợp lệ nếu có (kết quả không tồn tại, revision cũ, yêu cầu đã đóng, thợ không còn hợp lệ...)',
    example: 'Valid recommendation',
    required: false,
  })
  reason?: string;

  @ApiProperty({ description: 'ID tài khoản thợ', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', required: false })
  workerUserId?: string;

  @ApiProperty({ description: 'ID yêu cầu dịch vụ', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', required: false })
  serviceRequestId?: string;

  @ApiProperty({ description: 'Phiên bản revision tương ứng', example: 1, required: false })
  requestRevision?: number;

  @ApiProperty({ description: 'Điểm matching của kết quả', example: 92.5, required: false })
  matchingScore?: number;
}
