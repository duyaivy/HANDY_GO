import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConversationListQueryDto {
  @ApiPropertyOptional({
    description: 'Số lượng cuộc trò chuyện tối đa trả về trên mỗi trang',
    minimum: 1,
    maximum: 100,
    default: 30,
    example: 30,
  })
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Con trỏ phân trang dạng opaque base64url lấy từ nextCursor của trang trước',
    maxLength: 2048,
    example:
      'eyJ2IjoxLCJ1c2VySWQiOiJhMWIyYzNkNC1lNWY2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4OTAiLCJzb3J0VGltZXN0YW1wIjoiMjAyNi0xMS0xMVQwNTowMDowMC4wMDBaIiwiaWQiOiJmNDdhYzEwYi01OGNjLTQzNzItYTU2Ny0wZTAyYjJjM2Q0NzkifQ',
  })
  cursor?: string;
}

export class MessageListQueryDto {
  @ApiPropertyOptional({
    description: 'Số lượng tin nhắn tối đa trả về trên mỗi trang',
    minimum: 1,
    maximum: 100,
    default: 30,
    example: 30,
  })
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Lấy các tin nhắn trước sequence này (tin nhắn cũ hơn). Không dùng đồng thời với afterSequence.',
    example: '100',
  })
  beforeSequence?: string;

  @ApiPropertyOptional({
    description:
      'Lấy các tin nhắn sau sequence này (tin nhắn mới hơn). Không dùng đồng thời với beforeSequence.',
    example: '0',
  })
  afterSequence?: string;
}
