import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceRequestMilestoneDto {
  @ApiProperty({ example: 'open_for_bidding' })
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  publishedAt?: Date;

  @ApiPropertyOptional()
  cancelledAt?: Date;

  @ApiPropertyOptional()
  expiredAt?: Date;

  @ApiPropertyOptional()
  convertedAt?: Date;
}

export class MatchingMilestoneDto {
  @ApiProperty({ example: 'completed', enum: ['idle', 'started', 'completed', 'failed'] })
  status!: string;

  @ApiPropertyOptional({ example: 3 })
  matchCount?: number;

  @ApiPropertyOptional()
  completedAt?: Date;
}

export class BiddingMilestoneDto {
  @ApiProperty({ example: 'open', enum: ['idle', 'open', 'closed', 'finalized'] })
  status!: string;

  @ApiProperty({ example: 5 })
  bidCount!: number;

  @ApiPropertyOptional()
  openedAt?: Date;

  @ApiPropertyOptional()
  closedAt?: Date;

  @ApiPropertyOptional()
  finalizedAt?: Date;

  @ApiPropertyOptional({ description: 'Thông tin báo giá riêng của thợ đang truy vấn' })
  myBid?: {
    bidId: string;
    amount?: number;
    status?: string;
  };
}

export class ProposalMilestoneDto {
  @ApiPropertyOptional({ example: 'finalized' })
  status?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  proposalId?: string;

  @ApiPropertyOptional({ example: 1 })
  revisionNo?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  workerId?: string;

  @ApiPropertyOptional()
  finalizedAt?: Date;
}

export class OrderMilestoneDto {
  @ApiPropertyOptional({ format: 'uuid' })
  orderId?: string;

  @ApiPropertyOptional({ example: 'in_progress' })
  status?: string;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiPropertyOptional()
  cancelledAt?: Date;
}

export class PaymentMilestoneDto {
  @ApiPropertyOptional({ example: 'succeeded' })
  status?: string;

  @ApiPropertyOptional()
  lastEventAt?: Date;
}

export class TrackingSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  flowId!: string;

  @ApiProperty({ format: 'uuid' })
  serviceRequestId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  orderId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  customerId?: string | null;

  @ApiProperty({
    example: 'ORDER_IN_PROGRESS',
    description: 'Giai đoạn tiến trình hiện tại được tính toán',
  })
  currentPhase!: string;

  @ApiProperty({ type: ServiceRequestMilestoneDto })
  serviceRequest!: ServiceRequestMilestoneDto;

  @ApiProperty({ type: MatchingMilestoneDto })
  matching!: MatchingMilestoneDto;

  @ApiProperty({ type: BiddingMilestoneDto })
  bidding!: BiddingMilestoneDto;

  @ApiPropertyOptional({ type: ProposalMilestoneDto })
  bookingProposal?: ProposalMilestoneDto;

  @ApiPropertyOptional({ type: OrderMilestoneDto })
  order?: OrderMilestoneDto;

  @ApiPropertyOptional({ type: PaymentMilestoneDto })
  payment?: PaymentMilestoneDto;

  @ApiProperty({ example: 8 })
  totalEvents!: number;

  @ApiProperty()
  lastActivityAt!: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
