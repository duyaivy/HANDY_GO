import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderEvidenceResponseDto {
  @ApiProperty({ description: 'Evidence UUID' })
  id: string;

  @ApiProperty({ description: 'Associated Order UUID' })
  orderId: string;

  @ApiProperty({ description: 'Media type', enum: ['image', 'video'] })
  mediaType: string;

  @ApiProperty({ description: 'Media URL' })
  mediaUrl: string;

  @ApiPropertyOptional({ description: 'Evidence description' })
  description?: string | null;

  @ApiProperty({ description: 'Timestamp when evidence was added' })
  createdAt: Date;
}
