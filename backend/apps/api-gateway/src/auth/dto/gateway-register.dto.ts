import { ApiProperty } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GatewayRegisterDto {
  @ApiProperty({ example: 'Nguyen Van A', description: 'Họ và tên người dùng (2-100 ký tự)' })
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @MinLength(2, { message: 'Họ và tên phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Họ và tên không được vượt quá 100 ký tự' })
  fullName!: string;

  @ApiProperty({ example: '0912345678', description: 'Số điện thoại di động' })
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  phone!: string;

  @ApiProperty({ example: 'customer@example.com', description: 'Địa chỉ email' })
  @IsEmail({}, { message: 'Địa chỉ email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @ApiProperty({
    example: 'P@ssword123',
    description: 'Mật khẩu (8-72 ký tự/byte, bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt)',
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
  password!: string;
}
