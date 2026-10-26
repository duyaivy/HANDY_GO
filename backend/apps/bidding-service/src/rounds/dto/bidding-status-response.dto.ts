import { ApiProperty } from '@nestjs/swagger';

export class BiddingStatusResponseDto {
  @ApiProperty({ description: 'Mã định danh duy nhất (UUID) của phiên báo giá' })
  roundId!: string;

  @ApiProperty({ description: 'Mã định danh yêu cầu dịch vụ liên kết với phiên' })
  serviceRequestId!: string;

  @ApiProperty({
    description: 'Trạng thái hiện tại của phiên báo giá',
    enum: ['pending', 'open', 'closed', 'no_bid', 'finalized', 'cancelled'],
    example: 'open',
  })
  status!: string;

  @ApiProperty({ description: 'Thời điểm bắt đầu mở phiên nhận báo giá' })
  opensAt!: Date;

  @ApiProperty({ description: 'Thời điểm kết thúc nhận báo giá' })
  closesAt!: Date;

  @ApiProperty({ description: 'Tổng số lượt báo giá đã gửi vào phiên' })
  bidCount!: number;

  @ApiProperty({ description: 'Số lượng báo giá hợp lệ đang hoạt động' })
  activeBidCount!: number;

  @ApiProperty({ description: 'Thời gian đếm ngược còn lại tính bằng giây trước khi đóng phiên' })
  timeRemainingSeconds!: number;

  @ApiProperty({ description: 'Đánh dấu phiên báo giá đã quá thời hạn hay chưa' })
  isExpired!: boolean;
}
