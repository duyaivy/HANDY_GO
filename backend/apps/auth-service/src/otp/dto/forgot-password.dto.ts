import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'customer@example.com',
    description: 'Email tài khoản cần đặt lại mật khẩu',
  })
  @IsNotEmpty({ message: 'Vui lòng cung cấp email' })
  @IsString({ message: 'Email phải là chuỗi ký tự' })
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  email!: string;
}
