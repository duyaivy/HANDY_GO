import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WalletTransactionResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'credit' })
  type!: string;

  @ApiProperty({ example: '25000' })
  amount!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Total wallet balance immediately before this posting; null for legacy entries without a recorded snapshot' })
  balanceBefore!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Total wallet balance immediately after this posting; reserved amounts are tracked separately' })
  balanceAfter!: string | null;

  @ApiProperty({ example: 'completed' })
  status!: string;

  @ApiPropertyOptional()
  referenceId?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedWalletTransactionsResponseDto {
  @ApiProperty({ type: [WalletTransactionResponseDto] })
  items!: WalletTransactionResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}
