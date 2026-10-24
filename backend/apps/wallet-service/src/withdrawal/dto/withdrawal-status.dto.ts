import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
export class WithdrawalStatusDto { @ApiProperty({ enum: ['succeeded','failed','cancelled'] }) @IsIn(['succeeded','failed','cancelled']) status!: 'succeeded'|'failed'|'cancelled'; }
