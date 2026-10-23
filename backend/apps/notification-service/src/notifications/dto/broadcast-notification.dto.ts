import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { NotificationCategory } from '@prisma/notification-client';

export const BroadcastTargetGroup = {
  ALL: 'ALL',
  CUSTOMERS: 'CUSTOMERS',
  WORKERS: 'WORKERS',
} as const;

export type BroadcastTargetGroup =
  (typeof BroadcastTargetGroup)[keyof typeof BroadcastTargetGroup];

export class AdminBroadcastNotificationDto {
  @ApiPropertyOptional({
    description:
      'Tiêu đề thông báo gửi đến người dùng (nếu để trống sẽ tự động lấy theo mẫu sự kiện)',
    example: 'Thông báo nâng cấp hệ thống định kỳ',
    maxLength: 300,
  })
  @IsOptional()
  @IsString({ message: 'Tiêu đề thông báo phải là chuỗi ký tự' })
  @MaxLength(300, { message: 'Tiêu đề thông báo không vượt quá 300 ký tự' })
  title?: string;

  @ApiPropertyOptional({
    description:
      'Nội dung chi tiết thông báo gửi đến người dùng (nếu để trống sẽ tự động lấy theo mẫu sự kiện)',
    example:
      'Hệ thống HANDY GO sẽ bảo trì định kỳ từ 01:00 đến 03:00 ngày mai. Kính mong quý khách thông cảm vì sự gián đoạn này.',
  })
  @IsOptional()
  @IsString({ message: 'Nội dung thông báo phải là chuỗi ký tự' })
  body?: string;

  @ApiPropertyOptional({
    description:
      'Loại sự kiện để test hoặc thông báo (ví dụ: order.created, order.status.changed, order.completed, order.cancelled, bid.submitted, bid.revised, booking_proposal.created, booking_proposal.changes_requested, booking_proposal.rejected, payment.succeeded, payment.failed, payment.refunded, wallet.credited, wallet.debited, wallet.balance.adjusted, matching.eligible_workers.ready, admin.broadcast). Mặc định: admin.broadcast',
    example: 'order.created',
    default: 'admin.broadcast',
  })
  @IsOptional()
  @IsString({ message: 'eventType phải là chuỗi ký tự' })
  eventType?: string = 'admin.broadcast';

  @ApiPropertyOptional({
    description:
      'Mã thực thể liên quan (ví dụ: orderId, proposalId, bidId, paymentId). Nếu để trống và sự kiện cần thực thể, hệ thống sẽ tự sinh UUID để test.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'entityId phải là định dạng UUID v4 hợp lệ' })
  entityId?: string;

  @ApiPropertyOptional({
    description:
      'Mã yêu cầu dịch vụ liên quan (requestId). Nếu để trống và sự kiện cần requestId, hệ thống sẽ tự sinh UUID để test.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'requestId phải là định dạng UUID v4 hợp lệ' })
  requestId?: string;

  @ApiPropertyOptional({
    description:
      'Danh mục thông báo (tự động suy ra từ eventType nếu không truyền, mặc định: system)',
    enum: NotificationCategory,
    default: NotificationCategory.system,
  })
  @IsOptional()
  @IsEnum(NotificationCategory, {
    message: 'Danh mục thông báo không hợp lệ',
  })
  category?: NotificationCategory;

  @ApiPropertyOptional({
    description: 'Nhóm người dùng mục tiêu (ALL, CUSTOMERS, WORKERS)',
    enum: ['ALL', 'CUSTOMERS', 'WORKERS'],
    default: 'ALL',
  })
  @IsOptional()
  @IsEnum(['ALL', 'CUSTOMERS', 'WORKERS'], {
    message: 'Nhóm người dùng mục tiêu phải là ALL, CUSTOMERS hoặc WORKERS',
  })
  targetGroup?: BroadcastTargetGroup = 'ALL';

  @ApiPropertyOptional({
    description:
      'Danh sách userId cụ thể cần gửi. Nếu để trống, hệ thống sẽ gửi đến toàn bộ người dùng trong targetGroup.',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsOptional()
  @IsArray({ message: 'Danh sách recipientUserIds phải là mảng' })
  @IsUUID('4', {
    each: true,
    message: 'Mỗi recipientUserId phải là định dạng UUID v4 hợp lệ',
  })
  recipientUserIds?: string[];

  @ApiPropertyOptional({
    description:
      'Có lên lịch gửi push notification tới thiết bị đang hoạt động hay không (mặc định: true để hỗ trợ test push notification trên mobile)',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'sendPush phải là giá trị boolean' })
  sendPush?: boolean = true;

  @ApiPropertyOptional({
    description:
      'Dữ liệu payload mở rộng đính kèm thông báo (JSON Object). Các trường dữ liệu sự kiện tương ứng sẽ tự động được sinh và gộp vào object này.',
    example: { announcementId: 'ann-001', type: 'maintenance' },
  })
  @IsOptional()
  @IsObject({ message: 'payload phải là object JSON hợp lệ' })
  payload?: Record<string, unknown>;
}

export class BroadcastResponseDto {
  @ApiProperty({
    description: 'Mã định danh duy nhất của phiên broadcast',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  broadcastId!: string;

  @ApiProperty({
    description: 'Tổng số người dùng thuộc diện mục tiêu',
    example: 100,
  })
  targetCount!: number;

  @ApiProperty({
    description: 'Số thông báo in-app đã tạo thành công',
    example: 98,
  })
  inAppCount!: number;

  @ApiProperty({
    description: 'Số lượt job push notification đã lên lịch',
    example: 0,
  })
  pushJobCount!: number;

  @ApiProperty({
    description:
      'Số người dùng bị bỏ qua do đã tắt thông báo in-app trong cài đặt',
    example: 2,
  })
  skippedCount!: number;
}
