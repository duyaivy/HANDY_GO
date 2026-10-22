import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
export class ProvisionWalletDto { @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string; }
