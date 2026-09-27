import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token của phiên cần thu hồi',
    example: 'd8f1e4b2a3c7...',
  })
  @IsNotEmpty({ message: 'Vui lòng cung cấp refreshToken' })
  @IsString({ message: 'refreshToken phải là chuỗi' })
  refreshToken: string;
}
