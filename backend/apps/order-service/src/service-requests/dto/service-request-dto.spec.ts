import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateServiceRequestDto, ServiceRequestMediaDto } from './create-service-request.dto.js';
import { UpdateServiceRequestDto } from './update-service-request.dto.js';

describe('ServiceRequest DTO GPS Validation', () => {
  describe('CreateServiceRequestDto GPS validation', () => {
    it('should validate successfully when latitude and longitude are within standard GPS boundaries', async () => {
      const dto = plainToInstance(CreateServiceRequestDto, {
        serviceId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        description: 'Sửa đường ống nước rò rỉ dưới bồn rửa',
        addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const errors = await validate(dto);
      const gpsErrors = errors.filter((e) => ['latitude', 'longitude'].includes(e.property));
      expect(gpsErrors).toHaveLength(0);
    });

    it('should validate boundary GPS coordinates (-90, 90, -180, 180)', async () => {
      const minBoundaryDto = plainToInstance(CreateServiceRequestDto, {
        latitude: -90,
        longitude: -180,
      });
      const maxBoundaryDto = plainToInstance(CreateServiceRequestDto, {
        latitude: 90,
        longitude: 180,
      });

      const minErrors = await validate(minBoundaryDto);
      const maxErrors = await validate(maxBoundaryDto);

      expect(minErrors.filter((e) => ['latitude', 'longitude'].includes(e.property))).toHaveLength(0);
      expect(maxErrors.filter((e) => ['latitude', 'longitude'].includes(e.property))).toHaveLength(0);
    });

    it('should allow optional latitude and longitude for initial drafts', async () => {
      const draftDto = plainToInstance(CreateServiceRequestDto, {
        description: 'Nháp yêu cầu chưa chọn địa chỉ',
      });

      const errors = await validate(draftDto);
      const gpsErrors = errors.filter((e) => ['latitude', 'longitude'].includes(e.property));
      expect(gpsErrors).toHaveLength(0);
    });

    it('should fail validation when latitude exceeds 90 degrees', async () => {
      const dto = plainToInstance(CreateServiceRequestDto, {
        latitude: 90.0001,
        longitude: 108.1499,
      });

      const errors = await validate(dto);
      const latError = errors.find((e) => e.property === 'latitude');
      expect(latError).toBeDefined();
      expect(latError?.constraints).toHaveProperty('max');
    });

    it('should fail validation when latitude is below -90 degrees', async () => {
      const dto = plainToInstance(CreateServiceRequestDto, {
        latitude: -90.0001,
        longitude: 108.1499,
      });

      const errors = await validate(dto);
      const latError = errors.find((e) => e.property === 'latitude');
      expect(latError).toBeDefined();
      expect(latError?.constraints).toHaveProperty('min');
    });

    it('should fail validation when longitude exceeds 180 degrees', async () => {
      const dto = plainToInstance(CreateServiceRequestDto, {
        latitude: 16.0748,
        longitude: 180.0001,
      });

      const errors = await validate(dto);
      const lngError = errors.find((e) => e.property === 'longitude');
      expect(lngError).toBeDefined();
      expect(lngError?.constraints).toHaveProperty('max');
    });

    it('should fail validation when longitude is below -180 degrees', async () => {
      const dto = plainToInstance(CreateServiceRequestDto, {
        latitude: 16.0748,
        longitude: -180.0001,
      });

      const errors = await validate(dto);
      const lngError = errors.find((e) => e.property === 'longitude');
      expect(lngError).toBeDefined();
      expect(lngError?.constraints).toHaveProperty('min');
    });

    it('should fail validation when latitude or longitude is not a number', async () => {
      const dto = plainToInstance(CreateServiceRequestDto, {
        latitude: 'not-a-number' as any,
        longitude: 'invalid-coord' as any,
      });

      const errors = await validate(dto);
      const latError = errors.find((e) => e.property === 'latitude');
      const lngError = errors.find((e) => e.property === 'longitude');
      expect(latError?.constraints).toHaveProperty('isNumber');
      expect(lngError?.constraints).toHaveProperty('isNumber');
    });
  });

  describe('UpdateServiceRequestDto GPS validation', () => {
    it('should validate partial GPS update when valid', async () => {
      const dto = plainToInstance(UpdateServiceRequestDto, {
        latitude: 16.0544,
        longitude: 108.2022,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject partial GPS update when coordinates are out of bounds', async () => {
      const dto = plainToInstance(UpdateServiceRequestDto, {
        latitude: 95.5,
        longitude: -190.2,
      });

      const errors = await validate(dto);
      const latError = errors.find((e) => e.property === 'latitude');
      const lngError = errors.find((e) => e.property === 'longitude');
      expect(latError?.constraints).toHaveProperty('max');
      expect(lngError?.constraints).toHaveProperty('min');
    });
  });
  describe('ServiceRequestMediaDto URL validation', () => {
    beforeEach(() => vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo'));
    afterEach(() => vi.unstubAllEnvs());

    it('should accept project Cloudinary URLs', async () => {
      const dto = plainToInstance(ServiceRequestMediaDto, {
        mediaUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        mediaType: 'image',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it.each([
      'http://res.cloudinary.com/demo/image/upload/a.jpg',
      'https://res.cloudinary.com.evil.test/demo/image/upload/a.jpg',
      'https://res.cloudinary.com/other/image/upload/a.jpg',
      'https://example.com/a.jpg',
    ])('rejects untrusted URL %s for both create and update', async (mediaUrl) => {
      for (const Dto of [CreateServiceRequestDto, UpdateServiceRequestDto]) {
        const dto = plainToInstance(Dto, { media: [{ mediaUrl, mediaType: 'image' }] });
        expect(await validate(dto)).not.toHaveLength(0);
      }
    });

    it('should reject local file URIs (file:///...)', async () => {
      const dto = plainToInstance(ServiceRequestMediaDto, {
        mediaUrl: 'file:///data/user/0/com.handygo/cache/IMG_001.jpg',
        mediaType: 'image',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('mediaUrl');
      expect(errors[0].constraints).toHaveProperty('isProjectCloudinaryUrl');
    });
  });
});