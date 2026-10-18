import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyResetOtpDto {
  @ApiProperty({
    example: 'customer@example.com',
    description: 'Email tài khoản cần xác thực mã OTP đặt lại mật khẩu',
  })
  @IsNotEmpty({ message: 'Vui lòng cung cấp email' })
  @IsString({ message: 'Email phải là chuỗi ký tự' })
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  email!: string;

  @ApiProperty({ example: '123456', description: 'Mã OTP xác thực gồm 6 chữ số' })
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  @Length(6, 6, { message: 'Mã OTP phải có đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP chỉ bao gồm đúng 6 chữ số' })
  otp!: string;
}
