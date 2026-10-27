import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentEligibilityResponseDto {
  @ApiProperty({ description: 'Order UUID' })
  orderId: string;

  @ApiProperty({ description: 'Human-readable order code', example: 'ORD-20261023-A1B2' })
  orderCode: string;

  @ApiProperty({ description: 'Current order lifecycle status' })
  status: string;

  @ApiProperty({ description: 'Current payment projection state' })
  paymentState: string;

  @ApiProperty({ description: 'Customer user UUID' })
  customerUserId: string;

  @ApiProperty({ description: 'Worker user UUID' })
  workerUserId: string;

  @ApiProperty({ description: 'Catalog service UUID' })
  serviceId: string;

  @ApiProperty({
    description: 'Final agreed price as exact Decimal string (strictly avoids floating-point)',
    example: '350000.00',
  })
  agreedPrice: string;

  @ApiProperty({ description: 'Currency code', example: 'VND' })
  currency: string;

  @ApiProperty({ description: 'Whether the order is eligible for final settlement payout' })
  isEligibleForSettlement: boolean;

  @ApiPropertyOptional({ description: 'Reason if not eligible for settlement' })
  reason?: string;
}
