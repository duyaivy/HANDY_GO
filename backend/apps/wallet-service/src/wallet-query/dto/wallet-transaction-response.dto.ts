import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WalletTransactionResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'credit' })
  type!: string;

  @ApiProperty({ example: '25000' })
  amount!: string;

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
