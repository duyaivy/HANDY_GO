import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class DisputeOrderDto {
  @ApiProperty({
    description: 'Detailed reason for opening a dispute',
    example: 'Thợ không đến đúng giờ và làm hỏng thiết bị xung quanh',
  })
  @IsNotEmpty({ message: 'Dispute reason is strictly required' })
  @IsString()
  @MinLength(5, {
    message: 'Dispute reason must be at least 5 characters long',
  })
  reason: string;
}
