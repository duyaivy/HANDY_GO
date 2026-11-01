import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderEvidenceResponseDto } from './order-evidence-response.dto.js';

export class OrderStatusHistoryItemDto {
  @ApiProperty({ description: 'Status history entry UUID' })
  id: string;

  @ApiPropertyOptional({ description: 'Previous order status' })
  fromStatus: string | null;

  @ApiProperty({ description: 'New order status' })
  toStatus: string;

  @ApiPropertyOptional({ description: 'User ID who triggered the transition' })
  changedByUserId: string | null;

  @ApiPropertyOptional({ description: 'Reason for the state transition' })
  reason: string | null;

  @ApiProperty({ description: 'Timestamp of the transition' })
  createdAt: Date;
}

export class OrderResponseDto {
  @ApiProperty({ description: 'Order UUID' })
  id: string;

  @ApiProperty({
    description: 'Unique human-readable order code',
    example: 'ORD-20261023-F7X2',
  })
  orderCode: string;

  @ApiProperty({ description: 'Source Service Request UUID' })
  serviceRequestId: string;

  @ApiProperty({ description: 'Accepted Booking Proposal UUID' })
  bookingProposalId: string;

  @ApiProperty({ description: 'Customer User UUID' })
  customerUserId: string;

  @ApiProperty({ description: 'Worker User UUID' })
  workerUserId: string;

  @ApiProperty({ description: 'Catalog Service UUID' })
  serviceId: string;

  @ApiProperty({
    description: 'Worker selection source',
    enum: ['bid', 'recommendation'],
  })
  selectionSource: string;

  @ApiPropertyOptional({ description: 'Selected Bid UUID' })
  selectedBidId?: string | null;

  @ApiPropertyOptional({ description: 'Selected Match Result UUID' })
  selectedMatchResultId?: string | null;

  @ApiProperty({
    description: 'Agreed final price (decimal string)',
    example: '350000.00',
  })
  agreedPrice: string;

  @ApiProperty({ description: 'Agreed scope of work description' })
  agreedScope: string;

  @ApiPropertyOptional({ description: 'Scheduled time of work' })
  scheduledAt?: Date | null;

  @ApiProperty({ description: 'Immutable address snapshot from Service Request' })
  addressText: string;

  @ApiProperty({ description: 'Immutable latitude snapshot' })
  latitude: number;

  @ApiProperty({ description: 'Immutable longitude snapshot' })
  longitude: number;

  @ApiProperty({
    description: 'Order lifecycle status',
    enum: [
      'created',
      'confirmed',
      'in_progress',
      'awaiting_customer_confirmation',
      'completed',
      'cancelled',
      'disputed',
    ],
  })
  status: string;

  @ApiProperty({
    description: 'Payment settlement projection state',
    enum: ['unpaid', 'pending', 'paid', 'refunded', 'failed'],
  })
  paymentState: string;

  @ApiPropertyOptional({ description: 'Timestamp worker confirmed readiness' })
  confirmedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Timestamp worker started work' })
  startedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Timestamp worker reported finish' })
  workerFinishedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Timestamp customer confirmed completion' })
  completedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Timestamp order was cancelled' })
  cancelledAt?: Date | null;

  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  cancelReason?: string | null;

  @ApiPropertyOptional({ description: 'Timestamp dispute was opened' })
  disputedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Reason for opening dispute' })
  disputeReason?: string | null;

  @ApiPropertyOptional({ description: 'Previous status before dispute' })
  disputePreviousStatus?: string | null;

  @ApiPropertyOptional({ description: 'Timestamp dispute was resolved by Admin' })
  disputeResolvedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Admin resolution note' })
  disputeResolutionNote?: string | null;

  @ApiPropertyOptional({
    description: 'Status history of this order',
    type: [OrderStatusHistoryItemDto],
  })
  statusHistory?: OrderStatusHistoryItemDto[];

  @ApiPropertyOptional({
    description: 'Evidences uploaded as proof of work',
    type: [OrderEvidenceResponseDto],
  })
  evidences?: OrderEvidenceResponseDto[];

  @ApiProperty({ description: 'Order creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Order last update timestamp' })
  updatedAt: Date;
}
