import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiResponseDto } from '@app/common';
import { IsUUID } from 'class-validator';

export class BidEligibilityQueryDto {
  @ApiProperty({ description: 'Mã định danh duy nhất (UUID) của yêu cầu dịch vụ' })
  @IsUUID('4')
  requestId!: string;

  @ApiProperty({ description: 'Mã định danh duy nhất (UUID) của tài khoản thợ' })
  @IsUUID('4')
  workerId!: string;
}

export class EligibleBidDetailsDto {
  @ApiProperty({ description: 'Mã định danh duy nhất (UUID) của báo giá' })
  id!: string;

  @ApiProperty({ description: 'Mã định danh yêu cầu dịch vụ' })
  serviceRequestId!: string;

  @ApiProperty({ description: 'Mã định danh tài khoản thợ' })
  workerId!: string;

  @ApiProperty({ description: 'Mức giá báo của thợ (VNĐ)' })
  amount!: number;

  @ApiProperty({ description: 'Trạng thái hiện tại của báo giá' })
  status!: string;

  @ApiProperty({ description: 'Số phiên bản của báo giá' })
  version!: number;

  @ApiPropertyOptional({ description: 'Thời hạn hiệu lực của báo giá' })
  validUntil!: Date | null;
}

export class BidEligibilityResponseDto {
  @ApiProperty({ description: 'Đánh dấu báo giá có đủ điều kiện để tạo đơn hàng (Order) hay không' })
  eligible!: boolean;

  @ApiPropertyOptional({ description: 'Lý do chi tiết nếu báo giá không đủ điều kiện' })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Thông tin chi tiết của báo giá hợp lệ',
    type: EligibleBidDetailsDto,
  })
  bid?: EligibleBidDetailsDto;
}

export class BidEligibilityResponseDtoEnvelope extends ApiResponseDto<BidEligibilityResponseDto> {
  @ApiProperty({ type: BidEligibilityResponseDto })
  declare data: BidEligibilityResponseDto;
}

