import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

export class GatewayRefreshTokenDto {
  @ApiProperty({ description: 'Refresh token để cấp mới access token' })
  @IsString({ message: 'Refresh token phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Refresh token không được để trống' })
  @IsJWT({ message: 'Refresh token không đúng định dạng JWT' })
  refreshToken!: string;
}
