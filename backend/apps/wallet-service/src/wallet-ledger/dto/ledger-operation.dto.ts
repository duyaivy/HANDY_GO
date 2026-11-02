import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
export class LedgerOperationDto { @ApiProperty() @IsString() operationId!: string; }
