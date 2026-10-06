import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class GatewayVerifyOtpDto {
  @ApiPropertyOptional({ example: 'customer@example.com', description: 'Email tài khoản' })
  @IsOptional()
  @IsString({ message: 'Email phải là chuỗi ký tự' })
  email?: string;

  @ApiPropertyOptional({ example: '0912345678', description: 'Số điện thoại tài khoản' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  phone?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Mã phiên challenge OTP (tùy chọn, gắn chặt OTP với đúng phiên yêu cầu)',
  })
  @IsOptional()
  @IsString({ message: 'challengeId phải là chuỗi ký tự' })
  challengeId?: string;

  @ApiProperty({ example: '123456', description: 'Mã xác thực 6 chữ số' })
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  @Length(6, 6, { message: 'Mã OTP phải có đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP chỉ bao gồm đúng 6 chữ số' })
  otp!: string;
}
