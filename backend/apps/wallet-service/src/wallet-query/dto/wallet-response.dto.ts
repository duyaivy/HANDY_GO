import { ApiProperty } from '@nestjs/swagger';

export class WalletResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  userId!: string;

  @ApiProperty({ example: '0', description: 'Point amount, represented as a decimal string' })
  balance!: string;

  @ApiProperty({ example: '0' })
  reservedBalance!: string;

  @ApiProperty({ example: '0' })
  availableBalance!: string;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
