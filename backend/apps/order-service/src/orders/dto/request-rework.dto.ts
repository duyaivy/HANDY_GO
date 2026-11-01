import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RequestReworkDto {
  @ApiProperty({
    description: 'Detailed reason customer is requesting rework',
    example: 'Đường ống vẫn còn rò rỉ nước ở mối nối, cần siết chặt lại',
  })
  @IsNotEmpty({ message: 'Rework reason is strictly required' })
  @IsString()
  @MinLength(5, { message: 'Rework reason must be at least 5 characters long' })
  reason: string;
}
