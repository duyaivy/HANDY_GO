import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiResponseDto, type ApiResponseEnvelope } from '@app/common';

export class UserSummaryDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'User ID trong User & Trust service',
  })
  id!: string;

  @ApiPropertyOptional({
    example: '0912345678',
    description: 'Số điện thoại',
    nullable: true,
  })
  phone!: string | null;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Địa chỉ email',
    nullable: true,
  })
  email!: string | null;

  @ApiProperty({
    example: ['Customer'],
    description: 'Danh sách vai trò của tài khoản',
  })
  roles!: string[];

  @ApiProperty({
    example: ['ORDER_CREATE', 'SERVICE_VIEW'],
    description: 'Danh sách mã quyền hạn của tài khoản',
  })
  permissions!: string[];
}

export class AuthSuccessDataDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Access Token có hạn 15 phút mang tokenType: access',
  })
  accessToken!: string;

  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Refresh Token có hạn tối đa 7 ngày',
  })
  refreshToken!: string;

  @ApiProperty({
    example: 900,
    description: 'Thời gian hiệu lực của Access Token tính bằng giây',
  })
  expiresIn!: number;

  @ApiProperty({
    type: () => UserSummaryDto,
    description: 'Thông tin tóm tắt của người dùng',
  })
  user!: UserSummaryDto;
}

export class AuthSuccessResponseDto extends ApiResponseDto<AuthSuccessDataDto> {
  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({ example: 'Thao tác thành công' })
  declare message: string;

  @ApiProperty({ type: () => AuthSuccessDataDto })
  declare data: AuthSuccessDataDto;
}

export type AuthSuccessData = AuthSuccessDataDto;
export type AuthSuccessResponse = ApiResponseEnvelope<AuthSuccessData>;

export class LogoutResponseDto extends ApiResponseDto<null> {
  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({ example: 'Đăng xuất thành công' })
  declare message: string;

  @ApiProperty({ example: null, nullable: true })
  declare data: null;
}

export type LogoutResponse = ApiResponseEnvelope<null>;

export class ForgotPasswordResponseDto extends ApiResponseDto<null> {
  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({
    example:
      'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
  })
  declare message: string;

  @ApiProperty({ example: null, nullable: true })
  declare data: null;
}

export type ForgotPasswordResponse = ApiResponseEnvelope<null>;

export class VerifyResetOtpDataDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    description: 'Mã token ủy quyền đặt lại mật khẩu ngắn hạn 15 phút dùng một lần',
  })
  resetToken!: string;

  @ApiProperty({
    example: 900,
    description: 'Thời gian hiệu lực của reset token tính bằng giây (15 phút)',
  })
  expiresIn!: number;
}

export class VerifyResetOtpResponseDto extends ApiResponseDto<VerifyResetOtpDataDto> {
  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({ example: 'Xác thực mã OTP thành công. Vui lòng đặt lại mật khẩu mới.' })
  declare message: string;

  @ApiProperty({ type: () => VerifyResetOtpDataDto })
  declare data: VerifyResetOtpDataDto;
}

export type VerifyResetOtpData = VerifyResetOtpDataDto;
export type VerifyResetOtpResponse = ApiResponseEnvelope<VerifyResetOtpData>;

export class ResetPasswordResponseDto extends ApiResponseDto<null> {
  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({
    example: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại với mật khẩu mới.',
  })
  declare message: string;

  @ApiProperty({ example: null, nullable: true })
  declare data: null;
}

export type ResetPasswordResponse = ApiResponseEnvelope<null>;

export class MeResponseDataDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiPropertyOptional({ example: '0912345678', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ example: 'user@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiProperty({ example: ['Customer'] })
  roles!: string[];

  @ApiProperty({ example: ['ORDER_CREATE', 'SERVICE_VIEW'] })
  permissions!: string[];

  @ApiProperty({ example: '2026-10-13T00:00:00.000Z' })
  createdAt!: Date;
}

export class MeResponseDto extends ApiResponseDto<MeResponseDataDto> {
  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({ example: 'Lấy thông tin tài khoản thành công' })
  declare message: string;

  @ApiProperty({ type: () => MeResponseDataDto })
  declare data: MeResponseDataDto;
}

export type MeResponseData = MeResponseDataDto;
export type MeResponse = ApiResponseEnvelope<MeResponseData>;

