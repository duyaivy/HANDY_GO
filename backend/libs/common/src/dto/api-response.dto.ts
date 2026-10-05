import { ApiProperty } from '@nestjs/swagger';

/**
 * Interface đại diện cho cấu trúc Phản hồi API Chuẩn hóa (Response Envelope)
 * áp dụng thống nhất cho toàn bộ các dịch vụ trong hệ thống HANDY GO.
 */
export interface ApiResponseEnvelope<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
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
  })
  data!: T;
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
