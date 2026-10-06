import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GatewayResendOtpDto {
  @ApiPropertyOptional({ example: 'customer@example.com', description: 'Email tài khoản' })
  @IsOptional()
  @IsString({ message: 'Email phải là chuỗi ký tự' })
  email?: string;

  @ApiPropertyOptional({ example: '0912345678', description: 'Số điện thoại tài khoản' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  phone?: string;
}
