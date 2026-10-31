import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class WithdrawalClaimDto {
  @ApiProperty({ description: 'payoutOperationId do Wallet cấp trong event wallet.withdrawal.requested' })
  @IsUUID()
  payoutOperationId!: string;

  @ApiPropertyOptional({ description: 'Tham chiếu payout phía Payment/provider (unique)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  payoutReference?: string;
}

export class WithdrawalStatusDto {
  @ApiProperty()
  @IsUUID()
  payoutOperationId!: string;

  @ApiProperty({ enum: ['succeeded', 'failed', 'cancelled'] })
  @IsIn(['succeeded', 'failed', 'cancelled'])
  status!: 'succeeded' | 'failed' | 'cancelled';
}
