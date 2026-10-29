import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
export class RefundCreditDto { @ApiProperty() @IsString() paymentId!: string; @ApiProperty() @IsString() refundId!: string; @ApiProperty() @Matches(/^[1-9]\d*$/) amount!: string; }
