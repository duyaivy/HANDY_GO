import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiResponseDto, type ApiResponseEnvelope } from '@app/common';

export class RegisterResponseDataDto {
  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Mã phiên challenge OTP (nếu có)',
  })
  challengeId?: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID tài khoản người dùng',
  })
  userId!: string;

  @ApiProperty({ example: '0912345678', description: 'Số điện thoại đăng ký' })
  phone!: string;

  @ApiProperty({ example: 'customer@example.com', description: 'Email đăng ký' })
  email!: string;

  @ApiProperty({ example: 'c***r@example.com', description: 'Email đã được che thông tin' })
  emailMasked!: string;

  @ApiProperty({ example: '2026-10-14T08:00:00.000Z', description: 'Thời điểm hết hạn OTP' })
  expiresAt!: string;

  @ApiProperty({ example: '2026-10-14T07:51:00.000Z', description: 'Thời điểm có thể gửi lại OTP' })
  resendAvailableAt!: string;

  @ApiProperty({
    example: 'Nhập mã OTP 6 chữ số đã được gửi qua email để kích hoạt tài khoản.',
    description: 'Hướng dẫn các bước xác thực tiếp theo',
  })
  verificationInstructions!: string;
}

export class RegisterResponseDto extends ApiResponseDto<RegisterResponseDataDto> {
  @ApiProperty({ example: 201 })
  declare statusCode: number;

  @ApiProperty({ example: 'Đăng ký thành công. Vui lòng xác thực tài khoản qua mã OTP.' })
  declare message: string;

  @ApiProperty({ type: () => RegisterResponseDataDto })
  declare data: RegisterResponseDataDto;
}

export type RegisterResponseData = RegisterResponseDataDto;
export type RegisterResponse = ApiResponseEnvelope<RegisterResponseData>;

