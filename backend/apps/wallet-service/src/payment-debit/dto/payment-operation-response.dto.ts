import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class PaymentOperationResponseDto {
  @ApiProperty() operationId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() idempotentReplay!: boolean;
  @ApiPropertyOptional({ example: 'INSUFFICIENT_FUNDS' }) failureCode?: string;
}
