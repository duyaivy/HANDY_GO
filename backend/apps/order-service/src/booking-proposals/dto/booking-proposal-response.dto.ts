import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingProposalStatus,
  WorkerSelectionSource,
} from '@prisma/order-client';

export class BookingProposalResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  serviceRequestId: string;

  @ApiPropertyOptional()
  supersedesProposalId?: string | null;

  @ApiProperty()
  revisionNo: number;

  @ApiProperty()
  customerUserId: string;

  @ApiProperty()
  workerUserId: string;

  @ApiProperty({ enum: WorkerSelectionSource })
  selectionSource: WorkerSelectionSource;

  @ApiPropertyOptional()
  sourceBidId?: string | null;

  @ApiPropertyOptional()
  sourceMatchResultId?: string | null;

  @ApiProperty({ description: 'Decimal string or number representation' })
  agreedPrice: string | number;

  @ApiProperty()
  agreedScope: string;

  @ApiPropertyOptional()
  scheduledAt?: Date | null;

  @ApiProperty({ enum: BookingProposalStatus })
  status: BookingProposalStatus;

  @ApiProperty()
  expiresAt: Date;

  @ApiPropertyOptional()
  workerRespondedAt?: Date | null;

  @ApiPropertyOptional()
  finalizedAt?: Date | null;

  @ApiPropertyOptional()
  responseNote?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
