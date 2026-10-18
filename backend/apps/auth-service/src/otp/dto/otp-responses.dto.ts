import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiResponseDto, type ApiResponseEnvelope } from '@app/common';

export class ResendOtpDataDto {
  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID phiên xác thực OTP',
  })
  challengeId?: string;

  @ApiProperty({
    example: '2026-10-13T14:05:00.000Z',
    description: 'Thời điểm hết hạn của OTP',
  })
  expiresAt!: string;

  @ApiProperty({
    example: '2026-10-13T14:01:00.000Z',
    description: 'Thời điểm có thể yêu cầu gửi lại OTP',
  })
  resendAvailableAt!: string;

  @ApiProperty({
    example: 'c***r@example.com',
    description: 'Email đã được che thông tin',
  })
  emailMasked!: string;
}

export class ResendOtpResponseDto extends ApiResponseDto<ResendOtpDataDto> {
  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({ example: 'Gửi lại mã OTP thành công' })
  declare message: string;

  @ApiProperty({ type: () => ResendOtpDataDto })
  declare data: ResendOtpDataDto;
}

export type ResendOtpData = ResendOtpDataDto;
export type ResendOtpResponse = ApiResponseEnvelope<ResendOtpData>;

