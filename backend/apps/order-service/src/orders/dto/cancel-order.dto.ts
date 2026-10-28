import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({
    description: 'Detailed reason for cancelling the order',
    example: 'Khách hàng có việc bận đột xuất phải đổi ngày',
  })
  @IsNotEmpty({ message: 'Cancellation reason is strictly required' })
  @IsString()
  @MinLength(5, {
    message: 'Cancellation reason must be at least 5 characters long',
  })
  reason: string;
}
