import {
  IsByteLength,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldP@ssword123',
    description: 'Mật khẩu hiện tại của tài khoản',
  })
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
  @IsByteLength(1, 72, { message: 'Mật khẩu hiện tại không được vượt quá 72 byte UTF-8' })
  oldPassword!: string;

  @ApiProperty({
    example: 'NewP@ssword123',
    description: 'Mật khẩu mới (8-72 ký tự/byte, bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt)',
  })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @IsByteLength(1, 72, { message: 'Mật khẩu mới không được vượt quá 72 byte UTF-8' })
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message: 'Mật khẩu mới phải bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt',
    },
  )
  newPassword!: string;
}
