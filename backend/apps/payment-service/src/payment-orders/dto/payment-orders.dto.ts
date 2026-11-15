import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: ['cash', 'point'] })
  @IsIn(['cash', 'point'])
  method!: 'cash' | 'point';
}

export class PayWithPointsDto {
  @ApiProperty({ description: 'The customer must explicitly confirm the Point payment' })
  @Equals(true)
  confirm!: boolean;
}
