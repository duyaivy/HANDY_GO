/// <reference types="multer" />
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CloudinaryService,
  InitVideoUploadDto,
  InitVideoUploadApiResponseDto,
  InitVideoUploadResponseDto,
  UploadImageApiResponseDto,
  UploadImageResponseDto,
} from '@app/cloudinary';
import { buildSuccessResponse, type ApiResponseEnvelope } from '@app/common';

@ApiTags('Uploads & Media')
@ApiBearerAuth('JWT-Auth')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload file hình ảnh (JPEG, PNG, WebP) truyền qua API Gateway lên Cloudinary',
    description:
      'Gửi file hình ảnh qua multipart/form-data (trường `file`). Backend truyền luồng stream dữ liệu trực tiếp tới Cloudinary và trả về metadata asset chuẩn hóa.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'File hình ảnh cần upload (cho phép: image/jpeg, image/png, image/webp)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Upload hình ảnh thành công',
    type: UploadImageApiResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'File không hợp lệ / không đúng định dạng / vượt quá dung lượng',
  })
  @ApiResponse({
    status: 500,
    description: 'Lỗi tải ảnh lên Cloudinary',
  })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseEnvelope<UploadImageResponseDto>> {
    const data = await this.cloudinaryService.uploadImage(file);
    return buildSuccessResponse(
      data,
      'Upload hình ảnh thành công',
      HttpStatus.OK,
    );
  }

  @Post('video/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Khởi tạo chữ ký upload video dung lượng lớn (Direct Chunked Upload)',
    description:
      '**LƯU Ý QUAN TRỌNG:** ENDPOINT NÀY KHÔNG NHẬN VÀ KHÔNG UPLOAD DỮ LIỆU FILE VIDEO.\n\n' +
      'Phía Frontend / Mobile gọi endpoint này để nhận thông số chữ ký xác thực signed upload từ backend và thực hiện upload trực tiếp từng chunk dữ liệu sang Cloudinary.\n\n' +
      '🛠️ **Development Tester:** (Môi trường dev)\n' +
      'Truy cập UI giả lập upload browser tại: `GET /dev/video-upload`\n\n' +
      '**Các bước thực hiện cho FE / Mobile:**\n' +
      '1. Gọi `POST /api/v1/uploads/video/init` kèm theo metadata (fileName, fileSize, mimeType, checksumSha256 tùy chọn).\n' +
      '2. Nhận kết quả gồm `uploadId`, `uploadUrl`, `chunkSize`, `signature`, `timestamp`, `publicId`, `apiKey`, `cloudName`.\n' +
      '3. Cắt file video local thành từng đoạn nhỏ theo kích thước `chunkSize` (mặc định 20MB).\n' +
      '4. POST trực tiếp từng chunk lên `uploadUrl` (Cloudinary API).\n' +
      '5. Mọi request chunk BẮT BUỘC bổ sung header `X-Unique-Upload-Id: <uploadId>` và `Content-Range: bytes <start>-<end>/<total>`.\n' +
      '6. Nếu một chunk thất bại, giữ nguyên `uploadId` và thử lại (retry) chỉ riêng chunk đó.\n' +
      '7. Quá trình kết thúc khi response từ Cloudinary phản hồi `done: true`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tạo chữ ký upload thành công',
    type: InitVideoUploadApiResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Metadata video không hợp lệ (MIME type không hỗ trợ hoặc kích thước vượt quá giới hạn)',
  })
  @ApiResponse({
    status: 500,
    description: 'Thiếu cấu hình Cloudinary trên server',
  })
  async initVideoUpload(
    @Body() dto: InitVideoUploadDto,
  ): Promise<ApiResponseEnvelope<InitVideoUploadResponseDto>> {
    const data = await this.cloudinaryService.createVideoUploadSignature(dto);
    return buildSuccessResponse(
      data,
      'Khởi tạo chữ ký upload video thành công',
      HttpStatus.OK,
    );
  }
}

