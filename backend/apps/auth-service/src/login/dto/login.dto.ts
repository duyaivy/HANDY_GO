import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsMaxByteLength } from '../../common/utils/password.util.js';

export class LoginDto {
  @ApiProperty({ example: '0912345678', description: 'Số điện thoại đăng nhập' })
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  phone!: string;

  @ApiProperty({ example: 'P@ssword123', description: 'Mật khẩu tài khoản' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsMaxByteLength(72, { message: 'Mật khẩu không được vượt quá 72 byte UTF-8' })
  password!: string;
}
