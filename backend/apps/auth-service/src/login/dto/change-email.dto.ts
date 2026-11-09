import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class RequestChangeEmailDto {
  @ApiProperty({
    example: 'new.email@gmail.com',
    description: 'Địa chỉ email mới cần cập nhật',
  })
  @IsEmail({}, { message: 'Địa chỉ email mới không đúng định dạng' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp email mới' })
  newEmail: string;
}

export class ConfirmChangeEmailDto {
  @ApiProperty({
    example: 'new.email@gmail.com',
    description: 'Địa chỉ email mới cần cập nhật',
  })
  @IsEmail({}, { message: 'Địa chỉ email mới không đúng định dạng' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp email mới' })
  newEmail: string;

  @ApiProperty({
    example: '123456',
    description: 'Mã xác thực OTP gồm 6 chữ số gửi qua email mới',
  })
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @Length(6, 6, { message: 'Mã OTP phải gồm đúng 6 chữ số' })
  otp: string;
}

