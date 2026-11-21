import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentPaginationDto } from '../../payment-query/dto/payment-query.dto.js';

export class CreateRefundDto {
  @ApiProperty({
    example: '50000',
    description: 'Số tiền hoàn (VND, số nguyên dương dạng chuỗi)',
  })
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amount!: string;

  @ApiProperty({
    example: 'ref-req-unique-key-001',
    description: 'Khóa chống lặp (Idempotency key)',
  })
  @IsString()
  @Length(1, 150)
  idempotencyKey!: string;

  @ApiProperty({
    example: 'Thợ không đến thực hiện dịch vụ đúng giờ',
    description: 'Lý do yêu cầu hoàn tiền',
  })
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class DecideRefundDto {
  @ApiProperty({
    example: true,
    description: 'true: Duyệt hoàn tiền; false: Từ chối hoàn tiền',
  })
  @IsBoolean()
  approve!: boolean;

  @ApiProperty({
    example: 'Đã xác minh bằng chứng thỏa đáng',
    description: 'Ghi chú quyết định của Admin',
  })
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export const REFUND_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'needs_review',
] as const;

export type RefundStatusType = (typeof REFUND_STATUSES)[number];

export class AdminRefundQueryDto extends PaymentPaginationDto {
  @ApiPropertyOptional({ enum: REFUND_STATUSES })
  @IsOptional()
  @IsIn(REFUND_STATUSES)
  status?: RefundStatusType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentId?: string;
}

