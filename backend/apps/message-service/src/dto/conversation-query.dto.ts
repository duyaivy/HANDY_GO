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
      'Con trỏ phân trang dạng opaque HMAC-signed token lấy trực tiếp từ trường nextCursor của phản hồi trang trước. Client không được tự tạo hay chỉnh sửa giá trị này. Không truyền tham số này khi lấy trang đầu tiên.',
    maxLength: 2048,
  })
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Lọc các cuộc trò chuyện thuộc một yêu cầu dịch vụ cụ thể (UUID).',
    format: 'uuid',
  })
  requestId?: string;

  @ApiPropertyOptional({
    description: 'Lọc các cuộc trò chuyện thuộc một đơn hàng cụ thể (UUID).',
    format: 'uuid',
  })
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Lọc các cuộc trò chuyện với một thợ/đối tác cụ thể (UUID).',
    format: 'uuid',
  })
  workerId?: string;
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
