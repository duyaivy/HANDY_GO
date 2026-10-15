import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token của phiên cần thu hồi',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsNotEmpty({ message: 'Vui lòng cung cấp refreshToken' })
  @IsString({ message: 'refreshToken phải là chuỗi' })
  @IsJWT({ message: 'refreshToken không đúng định dạng JWT' })
  refreshToken!: string;
}
