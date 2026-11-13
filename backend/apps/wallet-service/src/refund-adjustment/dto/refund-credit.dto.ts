import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, IsOptional, IsIn } from 'class-validator';
export class RefundCreditDto {
  @ApiProperty() @IsString() paymentId!: string;
  @ApiProperty() @IsString() refundId!: string;
  @ApiProperty() @Matches(/^[1-9]\d*$/) amount!: string;
  @IsOptional() @IsIn(['point', 'cash']) method?: 'point' | 'cash';
  @IsOptional() @Matches(/^[1-9]\d*$/) grossAmount?: string;
}
