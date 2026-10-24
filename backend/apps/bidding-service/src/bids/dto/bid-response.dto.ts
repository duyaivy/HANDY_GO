import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BidRevisionDto {
  @ApiProperty({ description: 'Mã định danh duy nhất (UUID) của bản sửa đổi' })
  id!: string;

  @ApiProperty({ description: 'Số thứ tự của bản sửa đổi (1, 2, 3...)' })
  revisionNo!: number;

  @ApiProperty({ description: 'Mức giá báo trước khi sửa (VNĐ)' })
  previousAmount!: number;

  @ApiProperty({ description: 'Mức giá báo mới sau khi sửa (VNĐ)' })
  newAmount!: number;

  @ApiPropertyOptional({ description: 'Nội dung tin nhắn trước khi sửa' })
  previousMessage!: string | null;

  @ApiPropertyOptional({ description: 'Nội dung tin nhắn mới sau khi sửa' })
  newMessage!: string | null;

  @ApiProperty({ description: 'Thời điểm thực hiện điều chỉnh báo giá' })
  revisedAt!: Date;
}

export class BidResponseDto {
  @ApiProperty({ description: 'Mã định danh duy nhất (UUID) của báo giá' })
  id!: string;

  @ApiProperty({ description: 'Mã định danh phiên báo giá (Bidding Round ID)' })
  biddingRoundId!: string;

  @ApiProperty({ description: 'Mã định danh yêu cầu dịch vụ (Service Request ID)' })
  serviceRequestId!: string;

  @ApiProperty({ description: 'Mã tài khoản thợ đã gửi báo giá (Worker ID)' })
  workerId!: string;

  @ApiProperty({ description: 'Mức giá báo cho dịch vụ (VNĐ)' })
  amount!: number;

  @ApiPropertyOptional({ description: 'Lời nhắn hoặc ghi chú của thợ' })
  message!: string | null;

  @ApiPropertyOptional({ description: 'Thời hạn hiệu lực của báo giá' })
  validUntil!: Date | null;

  @ApiProperty({
    description: 'Trạng thái hiện tại của báo giá',
    enum: ['active', 'withdrawn', 'expired', 'selected', 'rejected'],
    example: 'active',
  })
  status!: string;

  @ApiProperty({ description: 'Số phiên bản hiện tại để kiểm soát tranh chấp đồng thời' })
  version!: number;

  @ApiPropertyOptional({
    description: 'Đánh dấu mức giá và nội dung đã được ẩn (Sealed-Bid) đối với thợ đối thủ',
    example: false,
  })
  isMasked?: boolean;

  @ApiProperty({ description: 'Thời điểm nộp báo giá lần đầu' })
  submittedAt!: Date;

  @ApiProperty({ description: 'Tổng số lần đã điều chỉnh báo giá' })
  revisionsCount!: number;

  @ApiPropertyOptional({
    description: 'Lịch sử chi tiết các lần điều chỉnh báo giá',
    type: [BidRevisionDto],
  })
  revisions?: BidRevisionDto[];
}

export class BidListResponseDto {
  @ApiProperty({
    description: 'Danh sách các báo giá',
    type: [BidResponseDto],
  })
  items!: BidResponseDto[];

  @ApiProperty({ description: 'Tổng số báo giá thỏa mãn điều kiện lọc' })
  total!: number;

  @ApiProperty({ description: 'Chỉ số trang hiện tại' })
  page!: number;

  @ApiProperty({ description: 'Số lượng phần tử trên trang' })
  limit!: number;
}
