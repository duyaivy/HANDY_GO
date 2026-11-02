import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MinLength } from 'class-validator';
export class WalletAdjustmentDto { @ApiProperty({ enum: ['credit','debit'] }) @IsIn(['credit','debit']) direction!: 'credit'|'debit'; @ApiProperty() @Matches(/^[1-9]\d*$/) amount!: string; @ApiProperty() @IsString() @MinLength(5) reason!: string; @ApiProperty() @IsString() idempotencyKey!: string; }
