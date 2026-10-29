import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkerProfileSummaryDto {
  @ApiProperty({ description: 'Họ và tên của thợ', example: 'Nguyễn Văn Thợ' })
  fullName!: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện của thợ',
    example: 'https://res.cloudinary.com/handygo/image/upload/avatar.jpg',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Đánh giá sao trung bình (1.0 đến 5.0)',
    example: 4.85,
    nullable: true,
  })
  averageRating?: number | null;

  @ApiPropertyOptional({
    description: 'Số lượng đánh giá đã nhận',
    example: 42,
  })
  ratingCount?: number;

  @ApiPropertyOptional({
    description: 'Số đơn hàng đã hoàn thành',
    example: 38,
  })
  completedOrderCount?: number;

  @ApiPropertyOptional({
    description: 'Khoảng cách ước tính tới địa chỉ yêu cầu (km)',
    example: 2.5,
    nullable: true,
  })
  distanceKm?: number | null;
}

export class BidCandidateDto {
  @ApiProperty({
    description: 'Nguồn ứng viên: bid (Báo giá đấu thầu)',
    example: 'bid',
    enum: ['bid'],
  })
  selectionSource!: 'bid';

  @ApiProperty({
    description: 'Mã định danh duy nhất của báo giá nguồn (sourceBidId dùng để tạo Booking Proposal)',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  sourceBidId!: string;

  @ApiProperty({
    description: 'Mã người dùng (Thợ) nộp báo giá',
    example: 'c2b4d5e6-7f8a-9b0c-1d2e-3f4a5b6c7d8e',
  })
  workerUserId!: string;

  @ApiProperty({
    description: 'ID của bản ghi báo giá (alias của sourceBidId)',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  id!: string;

  @ApiProperty({
    description: 'ID phiên đấu thầu (bidding_round_id)',
    example: 'e1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  biddingRoundId!: string;

  @ApiProperty({
    description: 'ID yêu cầu dịch vụ',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  serviceRequestId!: string;

  @ApiProperty({
    description: 'ID thợ dự thầu',
    example: 'c2b4d5e6-7f8a-9b0c-1d2e-3f4a5b6c7d8e',
  })
  workerId!: string;

  @ApiProperty({
    description: 'Số tiền báo giá (VNĐ). Hiển thị 0 nếu thợ đối thủ xem (Sealed-bid)',
    example: 250000,
  })
  amount!: number;

  @ApiPropertyOptional({
    description: 'Tin nhắn kèm theo báo giá',
    example: 'Tôi có thể đến sau 30 phút và hoàn thành trong 1 giờ.',
    nullable: true,
  })
  message?: string | null;

  @ApiPropertyOptional({
    description: 'Thời điểm báo giá hết hiệu lực (ISO-8601)',
    example: '2026-10-29T10:00:00.000Z',
    nullable: true,
  })
  validUntil?: string | null;

  @ApiProperty({
    description: 'Trạng thái báo giá: active, withdrawn, expired, selected, rejected',
    example: 'active',
  })
  status!: string;

  @ApiPropertyOptional({
    description: 'Số phiên bản chỉnh sửa của báo giá (Bắt đầu từ 1)',
    example: 1,
  })
  version?: number;

  @ApiProperty({
    description: 'Thời điểm nộp báo giá (ISO-8601)',
    example: '2026-10-28T09:30:00.000Z',
  })
  submittedAt!: string;

  @ApiPropertyOptional({
    description: 'Tổng số lần đã chỉnh sửa báo giá',
    example: 0,
  })
  revisionsCount?: number;

  @ApiProperty({
    description: 'Cờ đánh dấu báo giá bị ẩn giá và tin nhắn (Đấu giá kín)',
    example: false,
  })
  isMasked!: boolean;

  @ApiPropertyOptional({
    description: 'Hồ sơ tóm tắt của thợ',
    type: WorkerProfileSummaryDto,
    nullable: true,
  })
  workerProfile?: WorkerProfileSummaryDto | null;
}

export class MatchingRecommendationDto {
  @ApiProperty({
    description: 'Nguồn ứng viên: recommendation (AI Gợi ý thợ tối ưu)',
    example: 'recommendation',
    enum: ['recommendation'],
  })
  selectionSource!: 'recommendation';

  @ApiProperty({
    description: 'Mã định danh kết quả matching (sourceMatchResultId dùng để tạo Booking Proposal)',
    example: '3be57428-c254-41e9-88d3-b518be20728d',
  })
  sourceMatchResultId!: string;

  @ApiProperty({
    description: 'Mã người dùng (Thợ) được AI đề xuất',
    example: '067399f4-197a-4d11-a32d-74f1efebd55a',
  })
  workerUserId!: string;

  @ApiProperty({
    description: 'Thứ hạng đề xuất AI (1 đến 20 trong dữ liệu nguồn)',
    example: 1,
  })
  rank!: number;

  @ApiProperty({
    description: 'Điểm tổng hợp phù hợp của AI (0.00 đến 100.00)',
    example: 92.5,
  })
  matchingScore!: number;

  @ApiPropertyOptional({
    description: 'Phân tích điểm thành phần (semantic, geo, rating, experience, completion)',
    example: {
      semanticScore: 88.5,
      geoScore: 95.0,
      ratingScore: 92.0,
      experienceScore: 80.0,
      completionScore: 90.0,
    },
    nullable: true,
  })
  scoreBreakdown?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Hồ sơ tóm tắt của thợ (nếu có, mặc định null)',
    type: WorkerProfileSummaryDto,
    nullable: true,
  })
  workerProfile?: WorkerProfileSummaryDto | null;
}

export class BiddingSectionDto {
  @ApiProperty({
    description: 'Trạng thái phiên đấu thầu (open, closed, no_bid, finalized, cancelled, pending, unavailable)',
    example: 'open',
  })
  status!: string;

  @ApiPropertyOptional({
    description: 'Thời điểm đóng phiên nhận báo giá (ISO-8601)',
    example: '2026-10-29T10:00:00.000Z',
    nullable: true,
  })
  closesAt?: string | null;

  @ApiProperty({
    description: 'Tổng số lượng báo giá hiện có',
    example: 3,
  })
  total!: number;

  @ApiProperty({
    description: 'Trang hiện tại của danh sách báo giá',
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: 'Số lượng báo giá mỗi trang',
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    description: 'Danh sách các báo giá (sắp xếp mới nhất lên đầu, hỗ trợ sealed-bid)',
    type: [BidCandidateDto],
  })
  items!: BidCandidateDto[];
}

export class MatchingSectionDto {
  @ApiProperty({
    description: 'Trạng thái xử lý matching AI (pending, processing, completed, failed, unavailable)',
    example: 'completed',
  })
  status!: string;

  @ApiProperty({
    description: 'Số lượng tối đa đề xuất AI hiển thị cho khách hàng (Top 5 theo quyết định nghiệp vụ mới nhất)',
    example: 5,
  })
  displayLimit: number = 5;

  @ApiProperty({
    description: 'Danh sách Top 5 thợ đề xuất bởi AI (đã deduplicate loại bỏ thợ đã nộp Bid, sắp xếp theo rank)',
    type: [MatchingRecommendationDto],
  })
  recommendations!: MatchingRecommendationDto[];

  @ApiPropertyOptional({
    description: 'Phiên bản mô hình AI (hoặc rule_based fallback)',
    example: 'multilingual-e5-small-v1',
  })
  modelVersion?: string;

  @ApiPropertyOptional({
    description: 'Thời điểm tạo kết quả đề xuất (ISO-8601)',
    example: '2026-10-28T09:35:00.000Z',
  })
  generatedAt?: string;
}

export class PartialFailureDetailDto {
  @ApiProperty({
    description: 'Tên dịch vụ gặp sự cố (bidding hoặc matching)',
    example: 'matching',
  })
  service!: string;

  @ApiProperty({
    description: 'Nguyên nhân sự cố / mã lỗi',
    example: 'Matching service unavailable or timed out',
  })
  reason!: string;

  @ApiPropertyOptional({
    description: 'Mã HTTP status upstream nếu có',
    example: 504,
  })
  statusCode?: number;
}

export class CandidatesDataDto {
  @ApiProperty({
    description: 'ID yêu cầu dịch vụ (Service Request UUID)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  requestId!: string;

  @ApiProperty({
    description: 'Trạng thái hiện tại của Service Request từ Order Service (nguồn chân lý)',
    example: 'open_for_bidding',
  })
  requestStatus!: string;

  @ApiProperty({
    description: 'Phân mục Bidding: Danh sách báo giá từ các thợ (xếp trên Matching theo Business Contract)',
    type: BiddingSectionDto,
  })
  bidding!: BiddingSectionDto;

  @ApiProperty({
    description: 'Phân mục Matching: Top 5 gợi ý thợ tối ưu từ AI (đã loại bỏ trùng lặp với Bids)',
    type: MatchingSectionDto,
  })
  matching!: MatchingSectionDto;

  @ApiProperty({
    description: 'Cờ partial failure: true nếu một trong hai dịch vụ gặp lỗi kết nối/timeout',
    example: false,
  })
  partial!: boolean;

  @ApiPropertyOptional({
    description: 'Chi tiết các phần thất bại cục bộ khi partial = true',
    type: [PartialFailureDetailDto],
  })
  partialFailures?: PartialFailureDetailDto[];
}
