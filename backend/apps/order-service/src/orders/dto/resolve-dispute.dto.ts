import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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
  @MinLength(5, {
    message: 'Resolution note must be at least 5 characters long',
  })
  resolutionNote: string;

  @ApiPropertyOptional({ description: 'Exact whole VND amount as a decimal string; refund only' })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  refundAmountVnd?: string;

  @ApiPropertyOptional({ description: 'Required for completed-order disputes' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  idempotencyKey?: string;
}
