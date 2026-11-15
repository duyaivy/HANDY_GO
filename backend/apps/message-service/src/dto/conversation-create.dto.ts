import { ApiProperty } from '@nestjs/swagger';

export class ConversationCreateDto {
  @ApiProperty({
    description:
      'ID của lượt báo giá (bid) hợp lệ (đang hoạt động trong giai đoạn đấu thầu hoặc đã được chọn) để tạo hoặc lấy hội thoại',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  bidId!: string;
}
