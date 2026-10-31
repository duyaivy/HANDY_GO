import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
export class PublishOutboxDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;
}
