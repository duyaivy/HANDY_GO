import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';

export type DisputeResolutionAction =
  | 'resume_previous_state'
  | 'cancel'
  | 'complete';

export class ResolveDisputeDto {
  @ApiProperty({
    description: 'Admin resolution action',
    enum: ['resume_previous_state', 'cancel', 'complete'],
    example: 'complete',
  })
  @IsNotEmpty({ message: 'Resolution action is strictly required' })
  @IsEnum(['resume_previous_state', 'cancel', 'complete'], {
    message:
      'Action must be one of: resume_previous_state, cancel, complete',
  })
  action: DisputeResolutionAction;

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
}
