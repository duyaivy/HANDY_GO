import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '@app/common';

export class WorkerDiscoverableRequestItemDto {
  @ApiProperty({ description: 'ID yêu cầu dịch vụ', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  id!: string;

  @ApiProperty({ description: 'Mã hiển thị yêu cầu dịch vụ', example: 'REQ-20261025-001' })
  requestCode!: string;

  @ApiProperty({ description: 'ID loại dịch vụ yêu cầu', example: 'c1d2e3f4-5678-90ab-cdef-1234567890ab' })
  serviceId!: string;

  @ApiProperty({ description: 'Mô tả công việc cần làm', example: 'Sửa đường ống nước bồn rửa chén bị rò rỉ' })
  description!: string;

  @ApiProperty({ description: 'Khoảng cách ước tính từ khu vực đăng ký của thợ (km)', example: 3.42 })
  distanceKm!: number;

  @ApiProperty({ description: 'Thời gian mong muốn thực hiện', example: '2026-10-26T09:00:00.000Z', required: false })
  scheduledAt?: string;

  @ApiProperty({ description: 'Địa chỉ khái quát của khách hàng', example: 'Quận 1, TP. Hồ Chí Minh', required: false })
  addressText?: string;

  @ApiProperty({ description: 'Thời điểm tạo yêu cầu', example: '2026-10-25T00:15:00.000Z' })
  createdAt!: string;
}

export class WorkerRequestDiscoveryResponseDto {
  @ApiProperty({ description: 'Danh sách các yêu cầu dịch vụ phù hợp', type: [WorkerDiscoverableRequestItemDto] })
  items!: WorkerDiscoverableRequestItemDto[];

  @ApiProperty({ description: 'Tổng số yêu cầu phù hợp tìm thấy', example: 12 })
  total!: number;

  @ApiProperty({ description: 'Trang hiện tại', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Số lượng mục trên một trang', example: 10 })
  limit!: number;
}

export class WorkerRequestDiscoveryResponseDtoEnvelope extends ApiResponseDto<WorkerRequestDiscoveryResponseDto> {
  @ApiProperty({ type: WorkerRequestDiscoveryResponseDto })
  declare data: WorkerRequestDiscoveryResponseDto;
}

