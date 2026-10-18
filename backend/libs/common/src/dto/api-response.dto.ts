import { ApiProperty } from '@nestjs/swagger';

/**
 * Interface đại diện cho cấu trúc Phản hồi API Chuẩn hóa (Response Envelope)
 * áp dụng thống nhất cho toàn bộ các dịch vụ trong hệ thống HANDY GO.
 */
export interface ApiResponseEnvelope<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
  code?: string;
}

/**
 * Alias cho ApiResponseEnvelope
 */
export type ApiResponse<T = unknown> = ApiResponseEnvelope<T>;

/**
 * Class DTO phục vụ OpenAPI/Swagger documentation và type validation
 * cho cấu trúc Phản hồi API Chuẩn hóa.
 */
export class ApiResponseDto<T = unknown> implements ApiResponseEnvelope<T> {
  @ApiProperty({
    description: 'Mã trạng thái HTTP',
    example: 200,
  })
  statusCode!: number;

  @ApiProperty({
    description: 'Thông điệp phản hồi',
    example: 'Thao tác thành công',
  })
  message!: string;

  @ApiProperty({
    description: 'Dữ liệu phản hồi chính',
    nullable: true,
  })
  data!: T;

  @ApiProperty({
    description: 'Mã lỗi nghiệp vụ, chỉ xuất hiện khi request thất bại',
    example: 'VALIDATION_ERROR',
    required: false,
  })
  code?: string;
}

export interface ApiErrorResponseEnvelope<
  T = unknown,
> extends ApiResponseEnvelope<T | null> {
  code: string;
}

export class ApiErrorResponseDto<T = unknown>
  extends ApiResponseDto<T | null>
  implements ApiErrorResponseEnvelope<T>
{
  @ApiProperty({
    description: 'Mã lỗi nghiệp vụ ổn định để client xử lý',
    example: 'EMAIL_ALREADY_EXISTS',
  })
  declare code: string;
}

/**
 * Utility helper tạo đối tượng ApiResponseEnvelope chuẩn hóa dạng { statusCode, message, data }.
 */
export function buildSuccessResponse<T>(
  data: T,
  message = 'Thao tác thành công',
  statusCode = 200,
): ApiResponseEnvelope<T> {
  return {
    statusCode,
    message,
    data,
  };
}

/**
 * Utility helper tạo lỗi theo cùng response envelope với phản hồi thành công.
 */
export function buildErrorResponse<T = unknown>(
  statusCode: number,
  code: string,
  message: string,
  data: T | null = null,
): ApiErrorResponseEnvelope<T> {
  return {
    statusCode,
    code,
    message,
    data,
  };
}
