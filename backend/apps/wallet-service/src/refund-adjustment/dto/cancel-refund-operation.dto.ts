import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CancelRefundOperationDto {
  @ApiProperty()
  @IsUUID()
  paymentId!: string;

  @ApiProperty()
  @IsUUID()
  refundId!: string;

  @ApiProperty()
  @IsUUID()
  customerUserId!: string;

  @ApiProperty()
  @Matches(/^[1-9]\d*$/)
  amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]{3,64}$/)
  failureCode?: string;
}
