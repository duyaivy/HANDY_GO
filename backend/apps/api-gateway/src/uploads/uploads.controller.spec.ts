import { describe, expect, it, vi } from 'vitest';
import { UploadsController } from './uploads.controller.js';
import type { CloudinaryService } from '@app/cloudinary';

describe('UploadsController', () => {
  const mockCloudinaryService = {
    uploadImage: vi.fn().mockResolvedValue({
      assetId: 'e78b5068cbeeca71918c6ee56b6e8c71',
      publicId: 'handy-go/images/vmnvsaydkehspnmo1vus',
      url: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1791215189/handy-go/images/vmnvsaydkehspnmo1vus.png',
      resourceType: 'image',
      format: 'png',
      width: 473,
      height: 147,
      bytes: 12079,
    }),
    createVideoUploadSignature: vi.fn().mockResolvedValue({
      uploadId: 'mock-upload-id',
      cloudName: 'mock-cloud',
      apiKey: 'mock-api-key',
      timestamp: 1730000000,
      signature: 'mock-sig',
      publicId: 'handy-go/videos/mock-upload-id',
      folder: 'handy-go/videos',
      resourceType: 'video',
      uploadUrl: 'https://api.cloudinary.com/v1_1/mock-cloud/video/upload',
      chunkSize: 20971520,
    }),
  } as unknown as CloudinaryService;

  const controller = new UploadsController(mockCloudinaryService);

  describe('uploadImage', () => {
    it('should return wrapped response envelope { statusCode, message, data }', async () => {
      const dummyFile = {
        fieldname: 'file',
        originalname: 'test.png',
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: Buffer.from('test'),
        size: 4,
      } as Express.Multer.File;

      const result = await controller.uploadImage(dummyFile);

      expect(result).toEqual({
        statusCode: 200,
        message: 'Upload hình ảnh thành công',
        data: {
          assetId: 'e78b5068cbeeca71918c6ee56b6e8c71',
          publicId: 'handy-go/images/vmnvsaydkehspnmo1vus',
          url: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1791215189/handy-go/images/vmnvsaydkehspnmo1vus.png',
          resourceType: 'image',
          format: 'png',
          width: 473,
          height: 147,
          bytes: 12079,
        },
      });
      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(dummyFile);
    });
  });

  describe('initVideoUpload', () => {
    it('should return wrapped response envelope { statusCode, message, data }', async () => {
      const dto = {
        fileName: 'demo.mp4',
        fileSize: 50000000,
        mimeType: 'video/mp4',
      };

      const result = await controller.initVideoUpload(dto);

      expect(result).toEqual({
        statusCode: 200,
        message: 'Khởi tạo chữ ký upload video thành công',
        data: {
          uploadId: 'mock-upload-id',
          cloudName: 'mock-cloud',
          apiKey: 'mock-api-key',
          timestamp: 1730000000,
          signature: 'mock-sig',
          publicId: 'handy-go/videos/mock-upload-id',
          folder: 'handy-go/videos',
          resourceType: 'video',
          uploadUrl: 'https://api.cloudinary.com/v1_1/mock-cloud/video/upload',
          chunkSize: 20971520,
        },
      });
      expect(mockCloudinaryService.createVideoUploadSignature).toHaveBeenCalledWith(dto);
    });
  });
});
