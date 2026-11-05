import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TimelineEventItemDto {
  @ApiProperty({ description: 'ID bản ghi sự kiện tracking', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'ID gốc của sự kiện từ publisher outbox', format: 'uuid' })
  eventId!: string;

  @ApiProperty({ description: 'Loại thực thể', example: 'service_request' })
  entityType!: string;

  @ApiProperty({ description: 'ID thực thể được tác động', format: 'uuid' })
  entityId!: string;

  @ApiProperty({ description: 'Tên loại sự kiện domain', example: 'service_request.published' })
  eventType!: string;

  @ApiProperty({ description: 'Tên microservice phát sinh sự kiện', example: 'order-service' })
  sourceService!: string;

  @ApiPropertyOptional({ description: 'Trạng thái trước khi chuyển dịch', nullable: true })
  fromStatus?: string | null;

  @ApiPropertyOptional({ description: 'Trạng thái mới sau khi chuyển dịch', nullable: true })
  toStatus?: string | null;

  @ApiPropertyOptional({ description: 'ID người dùng thực hiện thao tác', nullable: true, format: 'uuid' })
  actorUserId?: string | null;

  @ApiPropertyOptional({ description: 'Lý do thay đổi hoặc hủy bỏ', nullable: true })
  reason?: string | null;

  @ApiPropertyOptional({ description: 'Metadata bổ sung được lọc an toàn' })
  metadata?: Record<string, any> | null;

  @ApiProperty({ description: 'Thời điểm nghiệp vụ xảy ra sự kiện' })
  occurredAt!: Date;

  @ApiProperty({ description: 'Thời điểm tracking-service ghi nhận' })
  recordedAt!: Date;
}

export class TimelineListResponseDto {
  @ApiProperty({ type: [TimelineEventItemDto] })
  items!: TimelineEventItemDto[];

  @ApiProperty({ description: 'Tổng số sự kiện phù hợp', example: 12 })
  total!: number;

  @ApiProperty({ description: 'Trang hiện tại', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Số lượng phần tử mỗi trang', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Tổng số trang', example: 1 })
  totalPages!: number;
}
