import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
export class CollectCommissionDto { @ApiProperty() @IsString() paymentId!: string; @ApiProperty() @IsString() workerUserId!: string; @ApiProperty() @Matches(/^[1-9]\d*$/) amount!: string; @ApiProperty() @IsString() idempotencyKey!: string; }
