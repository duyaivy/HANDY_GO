import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCommissionRuleDto {
  @ApiProperty({
    example: '10.00',
    description: 'Percent between 0.00 and 30.00 with at most two decimals',
  })
  @IsString()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, {
    message: 'ratePercent must be a decimal string with at most two decimals',
  })
  ratePercent!: string;

  @ApiProperty({
    example: '2026-12-01T00:00:00+07:00',
    description: 'Must be in the future; never applied retroactively',
  })
  @IsDateString({ strict: true })
  @Matches(/(Z|[+-]\d{2}:?\d{2})$/, {
    message: 'effectiveFrom must include a timezone offset',
  })
  effectiveFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
