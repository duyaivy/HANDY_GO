/// <reference types="multer" />
import { Inject, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import type { v2 as CloudinarySDK, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES } from '@app/common';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  CLOUDINARY_API_BASE_URL,
  CLOUDINARY_PROVIDER,
} from './cloudinary.constants.js';
import { UploadImageResponseDto } from './dto/upload-image-response.dto.js';
import { InitVideoUploadDto } from './dto/init-video-upload.dto.js';
import { InitVideoUploadResponseDto } from './dto/init-video-upload-response.dto.js';

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject(CLOUDINARY_PROVIDER)
    private readonly cloudinaryClient: typeof CloudinarySDK,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Upload hình ảnh qua luồng streaming từ API Gateway lên Cloudinary.
   */
  async uploadImage(
    file: Express.Multer.File,
  ): Promise<UploadImageResponseDto> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new AppException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'File hình ảnh không được để trống',
      );
    }

    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      )
    ) {
      throw new AppException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Định dạng file không hợp lệ. Các định dạng được chấp nhận: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
      );
    }

    const maxSizeBytes =
      this.configService.cloudinaryImageMaxSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new AppException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Dung lượng file vượt quá giới hạn tối đa cho phép (${this.configService.cloudinaryImageMaxSizeMb}MB)`,
      );
    }

    const cloudName = this.configService.cloudinaryCloudName;
    const apiKey = this.configService.cloudinaryApiKey;
    const apiSecret = this.configService.cloudinaryApiSecret;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new AppException(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Cấu hình Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) chưa đầy đủ trên server',
      );
    }

    const folder = this.configService.cloudinaryImageFolder;

    return new Promise<UploadImageResponseDto>((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error || !result) {
            return reject(
              new AppException(
                500,
                ERROR_CODES.INTERNAL_SERVER_ERROR,
                `Tải ảnh lên Cloudinary thất bại: ${error?.message || 'Lỗi không xác định'}`,
              ),
            );
          }

          resolve({
            assetId: result.asset_id,
            publicId: result.public_id,
            url: result.secure_url,
            resourceType: result.resource_type,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
          });
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  /**
   * Khởi tạo và ký thông số xác thực Cloudinary cho phép Client upload video dung lượng lớn trực tiếp (Direct Chunked Upload).
   */
  async createVideoUploadSignature(
    dto: InitVideoUploadDto,
  ): Promise<InitVideoUploadResponseDto> {
    if (
      !ALLOWED_VIDEO_MIME_TYPES.includes(
        dto.mimeType as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
      )
    ) {
      throw new AppException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `MIME type của video không được hỗ trợ. Danh sách hỗ trợ: ${ALLOWED_VIDEO_MIME_TYPES.join(', ')}`,
      );
    }

    const maxVideoSizeBytes =
      this.configService.cloudinaryVideoMaxSizeMb * 1024 * 1024;
    if (dto.fileSize > maxVideoSizeBytes) {
      throw new AppException(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Kích thước file video vượt quá giới hạn cho phép (${this.configService.cloudinaryVideoMaxSizeMb}MB)`,
      );
    }

    const cloudName = this.configService.cloudinaryCloudName;
    const apiKey = this.configService.cloudinaryApiKey;
    const apiSecret = this.configService.cloudinaryApiSecret;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new AppException(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Cấu hình Cloudinary chưa đầy đủ trên server',
      );
    }

    const uploadId = crypto.randomUUID();
    const folder = this.configService.cloudinaryVideoFolder;
    const publicId = `${folder}/${crypto.randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const paramsToSign = {
      folder,
      public_id: publicId,
      timestamp,
    };

    const signature = this.cloudinaryClient.utils.api_sign_request(
      paramsToSign,
      apiSecret,
    );

    const chunkSize =
      this.configService.cloudinaryVideoChunkSizeMb * 1024 * 1024;

    const uploadUrl = `${CLOUDINARY_API_BASE_URL}/${cloudName}/video/upload`;

    return {
      uploadId,
      cloudName,
      apiKey,
      timestamp,
      signature,
      publicId,
      folder,
      resourceType: 'video',
      uploadUrl,
      chunkSize,
    };
  }
}
