import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SwaggerSpecsController } from './swagger-specs.controller.js';
import type { ConfigService } from '@app/config';

describe('SwaggerSpecsController', () => {
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

  it('throws NotFoundException khi serviceName không tồn tại trong config', async () => {
    await expect(
      controller.getServiceSpec('unknown-service'),
    ).rejects.toThrow(NotFoundException);
  });

  it('trả về offline spec khi config.getUrl ném lỗi', async () => {
    configService.getUrl.mockImplementation(() => {
      throw new Error('env not set');
    });

    const spec = (await controller.getServiceSpec('auth-service')) as Record<string, unknown>;
    expect(spec['info']).toMatchObject({ title: expect.stringContaining('Offline') });
    expect(spec['paths']).toEqual({});
  });

  it('trả về offline spec khi microservice trả HTTP lỗi', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );

    const spec = (await controller.getServiceSpec('auth-service')) as Record<string, unknown>;
    expect(spec['info']).toMatchObject({ title: expect.stringContaining('Offline') });
  });

  it('trả về spec hợp lệ và chuẩn hóa servers về "/"', async () => {
    const mockSpec = {
      openapi: '3.0.0',
      info: { title: 'Auth Service', version: '1.0.0' },
      servers: [{ url: 'http://auth-service:3001' }],
      paths: { '/api/v1/auth/login': {} },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockSpec), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const spec = (await controller.getServiceSpec('auth-service')) as Record<string, unknown>;
    expect(spec['servers']).toEqual([
      { url: '/', description: 'auth-service (qua API Gateway)' },
    ]);
    expect(spec['paths']).toEqual({ '/api/v1/auth/login': {} });
  });
});
