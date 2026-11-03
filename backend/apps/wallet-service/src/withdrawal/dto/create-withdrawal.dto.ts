import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches, IsString } from 'class-validator';
export class CreateWithdrawalDto { @ApiProperty() @IsUUID() bankAccountId!: string; @ApiProperty() @Matches(/^[1-9]\d*$/) amount!: string; @ApiProperty() @IsString() idempotencyKey!: string; }
