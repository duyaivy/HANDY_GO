import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTopupDto {
  @ApiProperty({ description: 'Whole VND amount; 1 VND credits 1 Point' })
  @IsInt()
  @Min(1)
  @Max(999_999_999)
  amountVnd!: number;

  @ApiProperty({ description: 'Client-generated key; replays return the same top-up' })
  @IsString()
  @MinLength(8)
  @MaxLength(150)
  idempotencyKey!: string;
}
