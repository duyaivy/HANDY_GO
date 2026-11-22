import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ORDER_CONSTANTS } from '../../common/constants/order.constants.js';

export type DisputeResolutionAction =
  | 'resume_previous_state'
  | 'cancel'
  | 'complete';
export type Hg82ResolutionAction = 'dismiss' | 'rework' | 'refund';

export class ResolveDisputeDto {
  @ApiProperty({
    description: 'Admin resolution action',
    enum: ['resume_previous_state', 'cancel', 'complete', 'dismiss', 'rework', 'refund'],
    example: 'complete',
  })
  @IsNotEmpty({ message: 'Resolution action is strictly required' })
  @IsEnum(['resume_previous_state', 'cancel', 'complete', 'dismiss', 'rework', 'refund'], {
    message:
      'Action must be one of: resume_previous_state, cancel, complete, dismiss, rework, refund',
  })
  action: DisputeResolutionAction | Hg82ResolutionAction;

  @ApiProperty({
    description: 'Admin note explaining the rationale of the resolution',
    example: 'Đã xác minh bằng chứng thợ hoàn thành đúng chất lượng, giải ngân cho thợ',
  })
  @IsNotEmpty({ message: 'Resolution note is strictly required' })
  @IsString()
  @MinLength(ORDER_CONSTANTS.MIN_RESOLUTION_NOTE_LENGTH, {
    message: 'Resolution note must be at least 5 characters long',
  })
  @MaxLength(ORDER_CONSTANTS.MAX_RESOLUTION_NOTE_LENGTH, {
    message: 'Resolution note must be at most 2000 characters long',
  })
  resolutionNote: string;

  @ApiPropertyOptional({ description: 'Exact whole VND amount as a decimal string; refund only' })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  refundAmountVnd?: string;

  @ApiPropertyOptional({ description: 'Required for completed-order disputes' })
  @IsOptional()
  @IsString()
  @MaxLength(ORDER_CONSTANTS.MAX_IDEMPOTENCY_KEY_LENGTH)
  idempotencyKey?: string;
}
