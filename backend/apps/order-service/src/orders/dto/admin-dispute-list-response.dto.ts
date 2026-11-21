import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DisputePartyInfoDto {
  @ApiProperty({ description: 'User UUID' })
  id: string;

  @ApiPropertyOptional({ description: 'Full name, when available' })
  fullName?: string;

  @ApiPropertyOptional({ description: 'Phone, when available' })
  phone?: string;
}

export class AdminDisputeEvidenceDto {
  @ApiProperty({ description: 'Evidence UUID' })
  id: string;

  @ApiProperty({ description: 'Evidence media URL' })
  mediaUrl: string;

  @ApiProperty({ description: 'Media type', enum: ['image', 'video'] })
  mediaType: string;

  @ApiPropertyOptional({ description: 'User who submitted the evidence' })
  submittedByUserId: string | null;

  @ApiProperty({ description: 'Evidence creation time' })
  createdAt: Date;
}

export class AdminDisputeItemDto {
  @ApiProperty({ description: 'Order UUID' })
  orderId: string;

  @ApiProperty({ description: 'Human-readable order code' })
  orderCode: string;

  @ApiProperty({ description: 'Current order status', enum: ['disputed'] })
  status: string;

  @ApiPropertyOptional({ description: 'Status before dispute' })
  disputePreviousStatus: string | null;

  @ApiProperty({ description: 'Customer User UUID' })
  customerUserId: string;

  @ApiProperty({ description: 'Worker User UUID' })
  workerUserId: string;

  @ApiProperty({ type: DisputePartyInfoDto })
  customer: DisputePartyInfoDto;

  @ApiProperty({ type: DisputePartyInfoDto })
  worker: DisputePartyInfoDto;

  @ApiProperty({ description: 'Catalog Service UUID' })
  serviceId: string;

  @ApiProperty({ description: 'Agreed price as a decimal string' })
  agreedPrice: string;

  @ApiProperty({ description: 'Currency', example: 'VND' })
  currency: string;

  @ApiPropertyOptional({ description: 'Reason for opening the dispute' })
  disputeReason: string | null;

  @ApiPropertyOptional({ description: 'When the dispute was opened' })
  disputedAt: Date | null;

  @ApiPropertyOptional({ description: 'When the order was completed' })
  completedAt: Date | null;

  @ApiPropertyOptional({ description: 'Decision for the current dispute cycle, if any' })
  resolution: {
    resolutionId: string;
    action: string;
    state: string;
    refundAmountVnd: string | null;
    decidedAt: Date;
    failureCode: string | null;
  } | null;

  @ApiProperty({ type: [AdminDisputeEvidenceDto] })
  evidences: AdminDisputeEvidenceDto[];

  @ApiProperty({ description: 'Order creation time' })
  createdAt: Date;
}

export class AdminDisputePaginationDto {
  @ApiProperty({ description: 'Page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total matching disputes' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}

export class AdminDisputeListResponseDto {
  @ApiProperty({ type: [AdminDisputeItemDto] })
  items: AdminDisputeItemDto[];

  @ApiProperty({ type: AdminDisputePaginationDto })
  pagination: AdminDisputePaginationDto;
}
