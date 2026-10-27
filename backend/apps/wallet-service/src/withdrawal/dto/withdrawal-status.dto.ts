import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
export class WithdrawalStatusDto { @ApiProperty({ enum: ['processing','succeeded','failed','cancelled'] }) @IsIn(['processing','succeeded','failed','cancelled']) status!: 'processing'|'succeeded'|'failed'|'cancelled'; }
