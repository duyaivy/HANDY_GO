import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatPermissionsDto {
  @ApiProperty({
    description: 'Quyền đọc tin nhắn trong cuộc trò chuyện',
    example: true,
  })
  read!: boolean;

  @ApiProperty({
    description: 'Quyền gửi tin nhắn trong cuộc trò chuyện',
    example: true,
  })
  send!: boolean;

  @ApiProperty({
    description: 'Lý do bị từ chối quyền gửi (nếu có)',
    nullable: true,
    example: null,
  })
  reason!: string | null;
}

export class ChatReadStateDto {
  @ApiProperty({
    description: 'ID cuộc trò chuyện',
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  conversationId!: string;

  @ApiProperty({
    description: 'ID người dùng',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  userId!: string;

  @ApiProperty({
    description: 'Số thứ tự sequence đã đọc cao nhất',
    example: '10',
  })
  lastReadSequence!: string;

  @ApiProperty({
    description: 'Thời điểm cập nhật trạng thái đọc gần nhất',
    format: 'date-time',
    example: '2026-11-11T05:00:00.000Z',
  })
  updatedAt!: string;
}

export class ChatConversationDto {
  @ApiProperty({
    description: 'ID cuộc trò chuyện',
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id!: string;

  @ApiProperty({
    description: 'ID yêu cầu dịch vụ liên quan',
    format: 'uuid',
    example: 'c1d2e3f4-5678-90ab-cdef-1234567890ab',
  })
  requestId!: string;

  @ApiProperty({
    description: 'ID đơn hàng liên quan nếu đã được chuyển đổi từ yêu cầu',
    format: 'uuid',
    nullable: true,
    example: null,
  })
  orderId!: string | null;

  @ApiProperty({
    description: 'ID khách hàng tham gia hội thoại',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  customerId!: string;

  @ApiProperty({
    description: 'ID thợ tham gia hội thoại',
    format: 'uuid',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  workerId!: string;

  @ApiProperty({
    description: 'Trạng thái hoạt động của hội thoại',
    enum: ['OPEN', 'READ_ONLY'],
    example: 'OPEN',
  })
  status!: 'OPEN' | 'READ_ONLY';

  @ApiProperty({
    description: 'Số thứ tự sequence tin nhắn cao nhất hiện tại',
    example: '10',
  })
  lastSequence!: string;

  @ApiProperty({
    description: 'Thời điểm gửi tin nhắn cuối cùng',
    format: 'date-time',
    nullable: true,
    example: '2026-11-11T05:00:00.000Z',
  })
  lastMessageAt!: string | null;

  @ApiProperty({
    description: 'Thời điểm tạo cuộc trò chuyện',
    format: 'date-time',
    example: '2026-11-11T04:30:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Thời điểm cập nhật cuộc trò chuyện gần nhất',
    format: 'date-time',
    example: '2026-11-11T05:00:00.000Z',
  })
  updatedAt!: string;

  @ApiProperty({
    description: 'Quyền hạn hiện tại của người dùng đối với hội thoại',
    type: ChatPermissionsDto,
  })
  permissions!: ChatPermissionsDto;

  @ApiProperty({
    description: 'Trạng thái đọc tin nhắn của các thành viên',
    type: [ChatReadStateDto],
  })
  readStates!: ChatReadStateDto[];

  @ApiPropertyOptional({
    description: 'Họ tên hiển thị của khách hàng',
    example: 'Nguyễn Văn A',
  })
  customerName?: string;

  @ApiPropertyOptional({
    description: 'Họ tên hiển thị của thợ',
    example: 'Trần Văn B',
  })
  workerName?: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện của khách hàng',
    nullable: true,
    example: 'https://res.cloudinary.com/demo/image/upload/avatar-customer.jpg',
  })
  customerAvatarUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện của thợ',
    nullable: true,
    example: 'https://res.cloudinary.com/demo/image/upload/avatar-worker.jpg',
  })
  workerAvatarUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Tên dịch vụ liên kết với yêu cầu',
    example: 'Sửa chữa điện lạnh',
  })
  serviceName?: string;
}

export class ReplyPreviewDto {
  @ApiProperty({
    description: 'ID tin nhắn được phản hồi',
    format: 'uuid',
    example: 'e1f2a3b4-c5d6-7890-ef01-23456789abcd',
  })
  id!: string;

  @ApiProperty({
    description: 'ID người gửi tin nhắn gốc',
    format: 'uuid',
    nullable: true,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  senderId!: string | null;

  @ApiProperty({
    description: 'Loại tin nhắn gốc',
    enum: ['TEXT', 'IMAGE', 'VIDEO'],
    nullable: true,
    example: 'TEXT',
  })
  messageType!: 'TEXT' | 'IMAGE' | 'VIDEO' | null;

  @ApiProperty({
    description: 'Nội dung trích đoạn (tối đa 160 ký tự)',
    nullable: true,
    example: 'Chào anh, tôi có thể đến lúc 9h sáng mai...',
  })
  content!: string | null;

  @ApiProperty({
    description: 'Đánh dấu tin nhắn gốc không còn khả dụng',
    example: false,
  })
  unavailable!: boolean;
}

export class ChatAttachmentDto {
  @ApiProperty({
    description: 'ID tệp đính kèm',
    format: 'uuid',
    example: '9a8b7c6d-5e4f-3210-fedc-ba9876543210',
  })
  id!: string;

  @ApiProperty({
    description: 'Khóa lưu trữ Cloudinary publicId',
    example: 'handy-go/chat/images/msg-att-123',
  })
  storageKey!: string;

  @ApiProperty({
    description: 'Phân loại phương tiện',
    enum: ['IMAGE', 'VIDEO'],
    example: 'IMAGE',
  })
  mediaType!: 'IMAGE' | 'VIDEO';

  @ApiProperty({
    description: 'MIME type của tệp',
    example: 'image/jpeg',
  })
  mimeType!: string;

  @ApiProperty({
    description: 'Kích thước tệp (bytes)',
    example: 1048576,
  })
  sizeBytes!: number;

  @ApiProperty({
    description: 'Vị trí thứ tự tệp đính kèm trong tin nhắn',
    example: 0,
  })
  position!: number;

  @ApiProperty({
    description: 'Chiều rộng ảnh/video (pixels)',
    nullable: true,
    example: 1920,
  })
  width!: number | null;

  @ApiProperty({
    description: 'Chiều cao ảnh/video (pixels)',
    nullable: true,
    example: 1080,
  })
  height!: number | null;

  @ApiProperty({
    description: 'Thời lượng video (mili-giây)',
    nullable: true,
    example: 15000,
  })
  durationMs!: number | null;

  @ApiPropertyOptional({
    description: 'Đánh dấu tệp không còn khả dụng',
    example: false,
  })
  unavailable?: boolean;

  @ApiProperty({
    description: 'Đường dẫn URL tải tệp ngắn hạn có chữ ký bảo mật',
    nullable: true,
    example:
      'https://res.cloudinary.com/demo/image/upload/s--abc--/v1/handy-go/chat/images/msg-att-123.jpg',
  })
  url!: string | null;

  @ApiProperty({
    description: 'Thời điểm hết hạn của URL đính kèm',
    format: 'date-time',
    nullable: true,
    example: '2026-11-11T06:00:00.000Z',
  })
  urlExpiresAt!: string | null;
}

export class ChatMessageDto {
  @ApiProperty({
    description: 'ID tin nhắn',
    format: 'uuid',
    example: 'e1f2a3b4-c5d6-7890-ef01-23456789abcd',
  })
  id!: string;

  @ApiProperty({
    description: 'ID cuộc trò chuyện',
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  conversationId!: string;

  @ApiProperty({
    description: 'ID người gửi tin nhắn',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  senderId!: string;

  @ApiProperty({
    description: 'ID idempotent do client phát sinh',
    format: 'uuid',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  clientMessageId!: string;

  @ApiProperty({
    description:
      'Số thứ tự sequence tăng dần của tin nhắn trong hội thoại',
    example: '1',
  })
  sequence!: string;

  @ApiProperty({
    description: 'Loại tin nhắn',
    enum: ['TEXT', 'IMAGE', 'VIDEO'],
    example: 'TEXT',
  })
  messageType!: 'TEXT' | 'IMAGE' | 'VIDEO';

  @ApiProperty({
    description: 'Nội dung văn bản tin nhắn',
    nullable: true,
    example: 'Chào anh, tôi có thể đến lúc mấy giờ?',
  })
  content!: string | null;

  @ApiProperty({
    description: 'ID tin nhắn đang được trả lời (nếu có)',
    format: 'uuid',
    nullable: true,
    example: null,
  })
  replyToId!: string | null;

  @ApiProperty({
    description: 'Thông tin trích đoạn tin nhắn được phản hồi',
    type: ReplyPreviewDto,
    nullable: true,
  })
  reply!: ReplyPreviewDto | null;

  @ApiProperty({
    description: 'Danh sách tệp phương tiện đính kèm',
    type: [ChatAttachmentDto],
  })
  attachments!: ChatAttachmentDto[];

  @ApiProperty({
    description: 'Thời điểm tin nhắn được tạo/lưu trữ',
    format: 'date-time',
    example: '2026-11-11T05:00:00.000Z',
  })
  createdAt!: string;
}

export class ConversationPageDto {
  @ApiProperty({
    description: 'Danh sách cuộc trò chuyện',
    type: [ChatConversationDto],
  })
  items!: ChatConversationDto[];

  @ApiProperty({
    description:
      'Con trỏ phân trang dạng opaque HMAC token để truyền vào query parameter cursor của trang tiếp theo; nhận giá trị null nếu đã đến trang cuối cùng. Client phải giữ nguyên giá trị chuỗi này nhận từ phản hồi trước mà không tự tạo hoặc chỉnh sửa.',
    nullable: true,
  })
  nextCursor!: string | null;
}

export class MessageHistoryPageDto {
  @ApiProperty({
    description: 'Danh sách tin nhắn theo thứ tự sequence tăng dần',
    type: [ChatMessageDto],
  })
  items!: ChatMessageDto[];

  @ApiProperty({
    description: 'Sequence cũ nhất để tải trang trước đó, null nếu không còn',
    nullable: true,
    example: '1',
  })
  nextBeforeSequence!: string | null;

  @ApiProperty({
    description: 'Sequence mới nhất để tải trang sau đó, null nếu không còn',
    nullable: true,
    example: '10',
  })
  nextAfterSequence!: string | null;

  @ApiProperty({
    description: 'Sequence cao nhất hiện tại của toàn bộ hội thoại',
    example: '10',
  })
  highWaterSequence!: string;
}

export class ConversationResponseEnvelopeDto {
  @ApiProperty({ description: 'Mã HTTP trạng thái', example: 200 })
  statusCode!: number;

  @ApiProperty({ description: 'Thông điệp phản hồi', example: 'Success' })
  message!: string;

  @ApiProperty({
    description: 'Dữ liệu cuộc trò chuyện',
    type: ChatConversationDto,
  })
  data!: ChatConversationDto;
}

export class ConversationListResponseEnvelopeDto {
  @ApiProperty({ description: 'Mã HTTP trạng thái', example: 200 })
  statusCode!: number;

  @ApiProperty({ description: 'Thông điệp phản hồi', example: 'Success' })
  message!: string;

  @ApiProperty({
    description: 'Dữ liệu danh sách cuộc trò chuyện',
    type: ConversationPageDto,
  })
  data!: ConversationPageDto;
}

export class MessageHistoryResponseEnvelopeDto {
  @ApiProperty({ description: 'Mã HTTP trạng thái', example: 200 })
  statusCode!: number;

  @ApiProperty({ description: 'Thông điệp phản hồi', example: 'Success' })
  message!: string;

  @ApiProperty({
    description: 'Dữ liệu lịch sử tin nhắn',
    type: MessageHistoryPageDto,
  })
  data!: MessageHistoryPageDto;
}

export class MessageReadResponseEnvelopeDto {
  @ApiProperty({ description: 'Mã HTTP trạng thái', example: 200 })
  statusCode!: number;

  @ApiProperty({ description: 'Thông điệp phản hồi', example: 'Success' })
  message!: string;

  @ApiProperty({
    description: 'Trạng thái đã đọc sau khi cập nhật',
    type: ChatReadStateDto,
  })
  data!: ChatReadStateDto;
}

export class ChatErrorEnvelopeDto {
  @ApiProperty({ description: 'Mã HTTP trạng thái lỗi', example: 400 })
  statusCode!: number;

  @ApiProperty({
    description: 'Thông điệp mô tả lỗi',
    example: 'VALIDATION_ERROR',
  })
  message!: string;

  @ApiProperty({
    description: 'Dữ liệu trả về (luôn là null khi có lỗi)',
    type: 'string',
    nullable: true,
    example: null,
  })
  data!: null;

  @ApiProperty({
    description: 'Mã lỗi nghiệp vụ định danh',
    example: 'VALIDATION_ERROR',
  })
  code!: string;
}
