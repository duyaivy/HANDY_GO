import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength, Validate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ValidationArguments, ValidatorConstraintInterface } from 'class-validator';
import { ValidatorConstraint } from 'class-validator';

@ValidatorConstraint({ name: 'isBcryptSafe', async: false })
export class IsBcryptSafeConstraint implements ValidatorConstraintInterface {
  validate(password: string): boolean {
    if (typeof password !== 'string') return false;
    return Buffer.byteLength(password, 'utf8') <= 72;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Mật khẩu không được vượt quá 72 bytes';
  }
}

export class RegisterDto {
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

  @ApiProperty({ example: 'P@ssword123', description: 'Mật khẩu (tối thiểu 8 ký tự, tối đa 72 bytes)' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  @Validate(IsBcryptSafeConstraint)
  password!: string;
}
