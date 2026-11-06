/// <reference types="multer" />
import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import type {
  v2 as CloudinarySDK,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
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
    chatOwnerId?: string,
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
    const chatKey = chatOwnerId
      ? `handy-go/chat/images/${crypto.randomUUID()}`
      : undefined;
    const chatContext =
      chatOwnerId && chatKey
        ? this.chatContext(chatOwnerId, chatKey, 'image')
        : undefined;

    return new Promise<UploadImageResponseDto>((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        {
          ...(chatKey ? { public_id: chatKey } : { folder }),
          resource_type: 'image',
          ...(chatOwnerId
            ? { type: 'authenticated', overwrite: false, context: chatContext }
            : {}),
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
    chatOwnerId?: string,
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

    if (dto.intent === 'chat' && !chatOwnerId)
      throw new UnprocessableEntityException('Chat identity required');
    if (dto.intent === 'chat' && dto.fileSize > 100 * 1024 * 1024)
      throw new UnprocessableEntityException('Chat video too large');

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
    const folder =
      dto.intent === 'chat' ? '' : this.configService.cloudinaryVideoFolder;
    const publicId =
      dto.intent === 'chat'
        ? `handy-go/chat/videos/${crypto.randomUUID()}`
        : `${folder}/${crypto.randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const privateOptions =
      dto.intent === 'chat'
        ? {
            type: 'authenticated' as const,
            overwrite: false as const,
            context: this.chatContext(chatOwnerId!, publicId, 'video'),
          }
        : {};
    const paramsToSign = {
      ...privateOptions,
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
      ...privateOptions,
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
  private chatContext(
    ownerId: string,
    key: string,
    resourceType: string,
  ): string {
    const secret = this.configService.cloudinaryApiSecret;
    if (!secret)
      throw new UnprocessableEntityException('Chat media unavailable');
    const proof = crypto
      .createHmac('sha256', secret)
      .update(`${ownerId}:${resourceType}:${key}`)
      .digest('hex');
    return `chat_owner=${ownerId}|chat_intent=chat|chat_proof=${proof}`;
  }

  /** Provider context is signed at upload; clients cannot reassign owner or overwrite an existing key. */
  async verifyChatMedia(input: {
    storageKey: string;
    ownerId: string;
    mediaType: 'IMAGE' | 'VIDEO';
  }) {
    const reject = () =>
      new UnprocessableEntityException({
        code: 'MEDIA_UNVERIFIED',
        message: 'Không thể xác minh tệp đính kèm',
      });
    if (!/^[A-Za-z0-9_/-]{1,512}$/.test(input.storageKey)) throw reject();
    const configuredCapMb =
      input.mediaType === 'IMAGE'
        ? this.configService.cloudinaryImageMaxSizeMb
        : this.configService.cloudinaryVideoMaxSizeMb;
    if (!Number.isFinite(configuredCapMb) || configuredCapMb <= 0)
      throw reject();
    const maxBytes =
      Math.min(input.mediaType === 'IMAGE' ? 10 : 100, configuredCapMb) *
      1024 *
      1024;
    const resourceType = input.mediaType === 'IMAGE' ? 'image' : 'video';
    let asset;
    try {
      asset = await this.cloudinaryClient.api.resource(input.storageKey, {
        resource_type: resourceType,
        type: 'authenticated',
        context: true,
        timeout: 1500,
      });
    } catch {
      throw reject();
    }
    const context = asset.context?.custom;
    const mime: Record<string, string> =
      input.mediaType === 'IMAGE'
        ? {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
          }
        : { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
    const mimeType = mime[asset.format];
    const expectedProof = this.chatContext(
      input.ownerId,
      input.storageKey,
      resourceType,
    ).split('chat_proof=')[1];
    const actualProof = context?.chat_proof;
    const verifiedReceipt =
      typeof actualProof === 'string' &&
      Buffer.byteLength(actualProof) === Buffer.byteLength(expectedProof) &&
      crypto.timingSafeEqual(
        Buffer.from(actualProof),
        Buffer.from(expectedProof),
      );
    if (
      asset.public_id !== input.storageKey ||
      asset.resource_type !== resourceType ||
      asset.type !== 'authenticated' ||
      context?.chat_owner !== input.ownerId ||
      context?.chat_intent !== 'chat' ||
      !verifiedReceipt ||
      !mimeType ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes <= 0 ||
      asset.bytes > maxBytes
    )
      throw reject();
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    return {
      storageKey: input.storageKey,
      ownerId: input.ownerId,
      mediaType: input.mediaType,
      verified: true,
      ready: true,
      private: true,
      mimeType,
      sizeBytes: asset.bytes,
      width: Number.isInteger(asset.width) ? asset.width : null,
      height: Number.isInteger(asset.height) ? asset.height : null,
      durationMs:
        typeof asset.duration === 'number'
          ? Math.round(asset.duration * 1000)
          : null,
      url: this.cloudinaryClient.utils.private_download_url(
        input.storageKey,
        asset.format,
        {
          resource_type: resourceType,
          type: 'authenticated',
          expires_at: expiresAt,
          attachment: false,
        },
      ),
      urlExpiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }
}
