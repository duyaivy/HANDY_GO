import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches, IsString } from 'class-validator';
export class PaymentTopupSucceededDto { @ApiProperty() @IsUUID() userId!: string; @ApiProperty() @IsString() paymentId!: string; @ApiProperty() @Matches(/^[1-9]\d*$/) amount!: string; @ApiProperty() @IsString() idempotencyKey!: string; }
