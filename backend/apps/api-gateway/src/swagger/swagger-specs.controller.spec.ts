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

  describe('Message Service Integration', () => {
    it('truy xuất và chuẩn hóa đặc tả OpenAPI của message-service qua MESSAGE_SERVICE_URL', async () => {
      configService.getUrl.mockImplementation((key: string) => {
        if (key === 'MESSAGE_SERVICE_URL') return 'http://10.77.0.4:3009';
        throw new Error(`Unexpected key: ${key}`);
      });

      const messageSpec = {
        openapi: '3.0.0',
        info: {
          title: 'HANDY_GO Message Service API',
          version: '1.0.0',
        },
        servers: [{ url: 'http://10.77.0.4:3009' }],
        paths: {
          '/health': { get: { summary: 'Internal health check' } },
          '/api/v1/conversations': {
            get: { summary: 'List conversations' },
            post: { summary: 'Create conversation' },
          },
          '/api/v1/conversations/{id}': {
            get: { summary: 'Get conversation' },
          },
          '/api/v1/conversations/{id}/messages': {
            get: { summary: 'Message history' },
          },
          '/api/v1/conversations/{id}/read': {
            patch: { summary: 'Update read status' },
          },
        },
        components: {
          schemas: {
            ConversationCreateDto: { type: 'object' },
            ChatMessageDto: { type: 'object' },
          },
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(messageSpec), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const spec = (await controller.getServiceSpec('message-service')) as any;

      expect(configService.getUrl).toHaveBeenCalledWith('MESSAGE_SERVICE_URL');
      expect(fetchSpy).toHaveBeenCalledWith(
        new URL('/docs-json', 'http://10.77.0.4:3009'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // Verify servers rewritten to Gateway '/'
      expect(spec.servers).toEqual([
        { url: '/', description: 'message-service (qua API Gateway)' },
      ]);

      // Verify /health stripped
      expect(spec.paths['/health']).toBeUndefined();

      // Verify all business routes preserved
      expect(spec.paths['/api/v1/conversations']).toBeDefined();
      expect(spec.paths['/api/v1/conversations/{id}']).toBeDefined();
      expect(spec.paths['/api/v1/conversations/{id}/messages']).toBeDefined();
      expect(spec.paths['/api/v1/conversations/{id}/read']).toBeDefined();
      expect(spec.components?.schemas?.ConversationCreateDto).toBeDefined();
      expect(spec.components?.schemas?.ChatMessageDto).toBeDefined();
    });

    it('trả về offline spec khi message-service bị timeout hoặc lỗi kết nối', async () => {
      configService.getUrl.mockReturnValue('http://10.77.0.4:3009');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Timeout'));

      const spec = (await controller.getServiceSpec('message-service')) as any;

      expect(spec.info).toMatchObject({
        title: 'message-service (Offline)',
      });
      expect(spec.paths).toEqual({});
      expect(spec.servers).toEqual([
        { url: '/', description: 'message-service (via API Gateway)' },
      ]);
    });

    it('trả về offline spec khi thiếu biến môi trường MESSAGE_SERVICE_URL', async () => {
      configService.getUrl.mockImplementation((key: string) => {
        if (key === 'MESSAGE_SERVICE_URL') throw new Error('env not set');
        return 'http://localhost';
      });

      const spec = (await controller.getServiceSpec('message-service')) as any;

      expect(spec.info).toMatchObject({
        title: 'message-service (Offline)',
      });
      expect(spec.paths).toEqual({});
    });

    it('bảo vệ chống SSRF bằng cách từ chối các serviceName không hợp lệ', async () => {
      for (const invalidService of [
        'attacker.com',
        'http://10.77.0.4',
        '../etc/passwd',
        'message_service',
        'random-service',
      ]) {
        await expect(
          controller.getServiceSpec(invalidService),
        ).rejects.toThrow(NotFoundException);
      }
    });
  });
});
