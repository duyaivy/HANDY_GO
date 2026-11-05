import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyen Van B', description: 'Họ và tên cập nhật' })
  @IsOptional()
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Họ và tên phải có ít nhất 2 ký tự' })
  @MaxLength(150, { message: 'Họ và tên không được vượt quá 150 ký tự' })
  fullName?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/.../avatar.jpg',
    description: 'URL ảnh đại diện (nếu đã upload trước đó)',
  })
  @IsOptional()
  @IsString({ message: 'URL ảnh đại diện phải là chuỗi ký tự' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: 'Khách hàng thân thiết / Thợ sửa chữa tận tâm',
    description: 'Tiểu sử / Giới thiệu cá nhân',
  })
  @IsOptional()
  @IsString({ message: 'Tiểu sử phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Tiểu sử không được vượt quá 500 ký tự' })
  bio?: string;
}
