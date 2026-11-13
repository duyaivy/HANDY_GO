import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@app/config';
import type { Request } from 'express';

@Injectable()
export class ImageUploadInterceptor extends FileInterceptor('file') {
  constructor(@Inject(ConfigService) config: ConfigService) {
    const maxBytes = config.cloudinaryImageMaxSizeMb * 1024 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
      throw new Error(
        'CLOUDINARY_IMAGE_MAX_SIZE_MB must specify a positive byte limit',
      );
    super({
      limits: {
        fileSize: maxBytes,
        files: 1,
        fields: 1,
        fieldSize: 1024,
        parts: 3,
      },
      fileFilter: (
        _request: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
          return callback(
            new BadRequestException('Unsupported image type'),
            false,
          );
        callback(null, true);
      },
    });
  }
}
