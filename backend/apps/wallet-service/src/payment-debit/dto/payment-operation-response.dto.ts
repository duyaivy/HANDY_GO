import { ApiProperty } from '@nestjs/swagger';
export class PaymentOperationResponseDto {
  @ApiProperty() operationId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() idempotentReplay!: boolean;
}
