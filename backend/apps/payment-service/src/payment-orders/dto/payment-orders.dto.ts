import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: ['cash', 'point'] })
  @IsIn(['cash', 'point'])
  method!: 'cash' | 'point';

  @ApiPropertyOptional({ description: 'Whole VND amount shown to the customer before selecting the method', example: '150000' })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  expectedAmount?: string;
}

export class PayWithPointsDto {
  @ApiProperty({ description: 'The customer must explicitly confirm the Point payment' })
  @Equals(true)
  confirm!: boolean;
}
