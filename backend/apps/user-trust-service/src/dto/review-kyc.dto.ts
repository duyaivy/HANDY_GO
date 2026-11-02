import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum KycDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class ReviewKycDto {
  @ApiProperty({ enum: KycDecision, description: 'Quyết định phê duyệt hoặc từ chối KYC' })
  @IsEnum(KycDecision)
  decision: KycDecision;

  @ApiPropertyOptional({ description: 'Ghi chú hoặc lý do từ chối' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
