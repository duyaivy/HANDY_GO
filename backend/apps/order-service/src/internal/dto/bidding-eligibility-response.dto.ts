import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BiddingEligibilityResponseDto {
  @ApiProperty({ description: 'Service Request UUID' })
  serviceRequestId: string;

  @ApiProperty({ description: 'Whether the request is eligible for receiving bids (Bidding verifier contract)' })
  eligible: boolean;

  @ApiPropertyOptional({ description: 'Legacy alias for eligible' })
  isEligible?: boolean;

  @ApiProperty({ description: 'Current status of the service request' })
  status: string;

  @ApiPropertyOptional({ description: 'Current status alias matching Bidding verifier' })
  requestStatus?: string;

  @ApiPropertyOptional({ description: 'Timestamp when bidding closes' })
  biddingClosesAt?: Date | null;

  @ApiPropertyOptional({ description: 'Catalog service UUID' })
  serviceId?: string | null;

  @ApiPropertyOptional({ description: 'Customer user UUID' })
  customerUserId?: string | null;

  @ApiPropertyOptional({ description: 'Reason if not eligible' })
  reason?: string;
}
