import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
export class PublishOutboxDto { @ApiPropertyOptional({ minimum: 1, maximum: 100 }) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20; }
