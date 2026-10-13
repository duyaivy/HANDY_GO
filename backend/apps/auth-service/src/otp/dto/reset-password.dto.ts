import {
  IsByteLength,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'd9b7f5c3e1a24890...',
    description: 'Mã token xác thực đặt lại mật khẩu dùng một lần (nhận từ verify-reset-otp)',
  })
  @IsString({ message: 'resetToken phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'resetToken không được để trống' })
  resetToken!: string;

  @ApiProperty({
    example: 'P@ssword123',
    description: 'Mật khẩu mới (8-72 ký tự/byte, bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt)',
  })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu không được vượt quá 72 ký tự' })
  @IsByteLength(1, 72, { message: 'Mật khẩu không được vượt quá 72 byte UTF-8' })
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message: 'Mật khẩu phải bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt',
    },
  )
  newPassword!: string;
}
