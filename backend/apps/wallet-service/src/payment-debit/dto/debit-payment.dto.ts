import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class DebitPaymentDto {
  @ApiProperty() @IsString() @MaxLength(160) paymentId!: string;
  @ApiProperty() @IsString() @MaxLength(160) attemptId!: string;
  @ApiProperty() @IsString() workerUserId!: string;
  @ApiProperty({ description: 'Integer Point amount encoded as a decimal string' }) @Matches(/^[1-9]\d*$/) grossAmount!: string;
  @ApiProperty() @Matches(/^(0|[1-9]\d*)$/) workerEarning!: string;
  @ApiProperty() @Matches(/^(0|[1-9]\d*)$/) platformFee!: string;
}
