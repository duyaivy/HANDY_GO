import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkerSelectionSource } from '@prisma/order-client';

export class CreateBookingProposalDto {
  @ApiProperty({
    description: 'Target Service Request UUID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID()
  @IsNotEmpty()
  serviceRequestId: string;

  @ApiProperty({
    description: 'Selected Worker UUID',
    example: 'b1ffcd88-8b1a-4ef8-bb6d-7cc8bd380b22',
  })
  @IsUUID()
  @IsNotEmpty()
  workerUserId: string;

  @ApiProperty({
    enum: WorkerSelectionSource,
    description: 'Source of worker selection: bid or recommendation',
    example: WorkerSelectionSource.bid,
  })
  @IsEnum(WorkerSelectionSource)
  @IsNotEmpty()
  selectionSource: WorkerSelectionSource;

  @ApiPropertyOptional({
    description:
      'Originating Bid ID from Bidding Service (Required if selectionSource is bid)',
    example: 'c2eedf77-7a2b-4ef8-bb6d-8dd9bd380c33',
  })
  @IsOptional()
  @IsUUID()
  sourceBidId?: string;

  @ApiPropertyOptional({
    description:
      'Originating Matching Result ID from Matching Service (Required if selectionSource is recommendation)',
    example: 'd3ffea66-6b3c-4ef8-bb6d-9ee0bd380d44',
  })
  @IsOptional()
  @IsUUID()
  sourceMatchResultId?: string;

  @ApiProperty({
    description: 'Agreed contract price (VND)',
    example: 250000,
  })
  @IsNumber()
  @Min(0)
  agreedPrice: number;

  @ApiProperty({
    description: 'Agreed scope of work description',
    example: 'Thay mới dây cấp nước và van khóa bồn rửa chén',
  })
  @IsString()
  @IsNotEmpty()
  agreedScope: string;

  @ApiPropertyOptional({
    description: 'Scheduled execution datetime (ISO 8601)',
    example: '2026-10-25T14:30:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description:
      'Proposal validity expiration datetime (ISO 8601). Defaults to request selection_expires_at.',
    example: '2026-10-24T18:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({
    description:
      'ID of the previous proposal revision this revision supersedes (required when creating Revision > 1)',
    example: 'e4aabb55-5c4d-4ef8-bb6d-0ff1bd380e55',
  })
  @IsOptional()
  @IsUUID()
  supersedesProposalId?: string;

  @ApiPropertyOptional({
    description: 'Auto-accept proposal on worker side for instant dispatch/order creation',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoAccept?: boolean;
}
