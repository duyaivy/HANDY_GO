import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectProposalDto {
  @ApiPropertyOptional({
    description: 'Optional reason explaining why the proposal was rejected',
    example: 'Tôi đã kín lịch vào khung giờ này không thể nhận việc.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  responseNote?: string;
}
