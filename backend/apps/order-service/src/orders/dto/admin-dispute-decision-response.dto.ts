import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderResponseDto } from './order-response.dto.js';

export class AdminDisputeDecisionResponseDto extends OrderResponseDto {
  @ApiProperty({ description: 'Stable decision UUID' })
  resolutionId: string;

  @ApiProperty({ enum: ['refund_pending', 'needs_review', 'completed'] })
  state: string;

  @ApiPropertyOptional({ description: 'Exact whole VND amount when the action is refund' })
  refundAmountVnd: string | null;
}
