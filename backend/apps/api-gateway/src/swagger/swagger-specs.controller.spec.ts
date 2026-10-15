import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SwaggerSpecsController } from './swagger-specs.controller.js';
import type { ConfigService } from '@app/config';

describe('SwaggerSpecsController (Unit)', () => {
  let controller: SwaggerSpecsController;
  let configService: { getUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    configService = {
      getUrl: vi.fn().mockReturnValue('http://auth-service:3001'),
    };
    controller = new SwaggerSpecsController(
      configService as unknown as ConfigService,
    );
  });

  describe('Validation & Error Handling', () => {
    it('ném NotFoundException khi serviceName không tồn tại trong cấu hình Gateway', async () => {
      await expect(
        controller.getServiceSpec('unknown-service'),
      ).rejects.toThrow(NotFoundException);
    });

    it('trả về offline spec khi config.getUrl ném lỗi (thiếu biến môi trường)', async () => {
      configService.getUrl.mockImplementation(() => {
        throw new Error('env not set');
      });

      const spec = (await controller.getServiceSpec('auth-service')) as Record<
        string,
        unknown
      >;
      expect(spec['info']).toMatchObject({
        title: 'auth-service (Offline)',
      });
      expect(spec['paths']).toEqual({});
    });

    it('trả về offline spec khi downstream microservice trả HTTP lỗi (500)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500 }),
      );

      const spec = (await controller.getServiceSpec('auth-service')) as Record<
        string,
        unknown
      >;
      expect(spec['info']).toMatchObject({
        title: 'auth-service (Offline)',
      });
      expect(spec['paths']).toEqual({});
    });

    it('trả về offline spec khi kết nối mạng tới microservice bị lỗi (network failure / timeout)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('fetch failed / timeout'),
      );

      const spec = (await controller.getServiceSpec('auth-service')) as Record<
        string,
        unknown
      >;
      expect(spec['info']).toMatchObject({
        title: 'auth-service (Offline)',
      });
      expect(spec['paths']).toEqual({});
    });
  });

  describe('Spec Transformation & Normalization', () => {
    it('chuẩn hóa servers về "/" và loại bỏ route /health nội bộ của microservice', async () => {
      const mockSpec = {
        openapi: '3.0.0',
        info: { title: 'Auth Service API', version: '1.0.0' },
        servers: [{ url: 'http://auth-service:3001' }],
        paths: {
          '/health': { get: { summary: 'Internal health check' } },
          '/api/v1/auth/login': { post: { summary: 'User login' } },
          '/api/v1/auth/refresh': { post: { summary: 'Refresh token' } },
        },
        components: {
          schemas: {
            LoginDto: { type: 'object' },
          },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockSpec), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const spec = (await controller.getServiceSpec('auth-service')) as any;

      // 1. Chuẩn hóa servers về root Gateway '/'
      expect(spec.servers).toEqual([
        { url: '/', description: 'auth-service (qua API Gateway)' },
      ]);

      // 2. Loại bỏ route /health nội bộ của downstream service
      expect(spec.paths['/health']).toBeUndefined();

      // 3. Giữ nguyên vẹn các business routes và components schema
      expect(spec.paths['/api/v1/auth/login']).toBeDefined();
      expect(spec.paths['/api/v1/auth/refresh']).toBeDefined();
      expect(spec.components?.schemas?.LoginDto).toBeDefined();
    });
  });
});
