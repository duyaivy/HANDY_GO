import { IsBoolean, IsString, Length, Matches } from 'class-validator';

export class CreateRefundDto {
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amount!: string;

  @IsString()
  @Length(1, 150)
  idempotencyKey!: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}

export class DecideRefundDto {
  @IsBoolean()
  approve!: boolean;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}
