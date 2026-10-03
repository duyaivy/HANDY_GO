import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResendOtpDto {
  @ApiPropertyOptional({ example: 'customer@example.com', description: 'Email tài khoản' })
  @IsOptional()
  @IsString({ message: 'Email phải là chuỗi ký tự' })
  email?: string;

  @ApiPropertyOptional({ example: '0912345678', description: 'Số điện thoại tài khoản' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  phone?: string;
}
