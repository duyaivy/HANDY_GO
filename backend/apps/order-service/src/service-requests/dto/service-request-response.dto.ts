import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/order-client';

export class ServiceRequestMediaResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  serviceRequestId: string;

  @ApiProperty()
  mediaType: string;

  @ApiProperty()
  mediaUrl: string;

  @ApiProperty()
  createdAt: Date;
}

export class ServiceRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  requestCode: string;

  @ApiProperty()
  customerUserId: string;

  @ApiPropertyOptional()
  serviceId?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional()
  scheduledAt?: Date | null;

  @ApiPropertyOptional()
  aiRefPriceMin?: string | null;

  @ApiPropertyOptional()
  aiRefPriceMax?: string | null;

  @ApiPropertyOptional()
  addressText?: string | null;

  @ApiPropertyOptional()
  latitude?: string | null;

  @ApiPropertyOptional()
  longitude?: string | null;

  @ApiProperty({ enum: RequestStatus })
  status: RequestStatus;

  @ApiPropertyOptional()
  publishedAt?: Date | null;

  @ApiPropertyOptional()
  biddingClosesAt?: Date | null;

  @ApiPropertyOptional()
  selectionExpiresAt?: Date | null;

  @ApiProperty()
  version: number;

  @ApiProperty()
  matchingRevision: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [ServiceRequestMediaResponseDto] })
  media: ServiceRequestMediaResponseDto[];
}
