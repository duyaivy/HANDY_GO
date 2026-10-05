import { ApiProperty } from '@nestjs/swagger';
import type { ApiResponseEnvelope } from '@app/common';

export class InitVideoUploadResponseDto {

  @ApiProperty({
    description: 'Mã UUID duy nhất đại diện cho phiên upload chunk (sử dụng trong header X-Unique-Upload-Id)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  uploadId!: string;

  @ApiProperty({
    description: 'Cloud Name của Cloudinary',
    example: 'my-cloud-name',
  })
  cloudName!: string;

  @ApiProperty({
    description: 'API Key công khai của Cloudinary',
    example: '123456789012345',
  })
  apiKey!: string;

  @ApiProperty({
    description: 'Unix Timestamp tại thời điểm tạo chữ ký (giây)',
    example: 1730000000,
  })
  timestamp!: number;

  @ApiProperty({
    description: 'Chữ ký xác thực SHA-256 do backend ký',
    example: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
  })
  signature!: string;

  @ApiProperty({
    description: 'Public ID do backend chỉ định cho file video',
    example: 'handy-go/videos/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  publicId!: string;

  @ApiProperty({
    description: 'Thư mục trên Cloudinary',
    example: 'handy-go/videos',
  })
  folder!: string;

  @ApiProperty({
    description: 'Loại tài nguyên',
    example: 'video',
  })
  resourceType!: string;

  @ApiProperty({
    description: 'Đường dẫn URL trực tiếp đến endpoint upload video của Cloudinary',
    example: 'https://api.cloudinary.com/v1_1/my-cloud-name/video/upload',
  })
  uploadUrl!: string;

  @ApiProperty({
    description: 'Dung lượng khuyến nghị cho mỗi chunk (tính bằng bytes, ví dụ 20MB = 20971520 bytes)',
    example: 20971520,
  })
  chunkSize!: number;
}

export class InitVideoUploadApiResponseDto implements ApiResponseEnvelope<InitVideoUploadResponseDto> {
  @ApiProperty({
    description: 'Mã trạng thái HTTP',
    example: 200,
  })
  statusCode!: number;

  @ApiProperty({
    description: 'Thông điệp phản hồi',
    example: 'Khởi tạo chữ ký upload video thành công',
  })
  message!: string;

  @ApiProperty({
    description: 'Dữ liệu thông số khởi tạo chữ ký video',
    type: InitVideoUploadResponseDto,
  })
  data!: InitVideoUploadResponseDto;
}

