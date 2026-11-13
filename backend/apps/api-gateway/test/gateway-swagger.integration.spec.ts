import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { SwaggerSpecsController } from '../src/swagger/swagger-specs.controller.js';
import { setupSwagger } from '../src/swagger/swagger.config.js';
import { ConfigService } from '@app/config';

describe('Gateway Swagger Integration & Dropdown', () => {
  let setupSpy: any;

  beforeEach(() => {
    vi.spyOn(SwaggerModule, 'createDocument').mockReturnValue({} as any);
    setupSpy = vi.spyOn(SwaggerModule, 'setup').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes Message Service in the Swagger UI multi-spec dropdown config', () => {
    const mockApp = {
      getHttpAdapter: vi.fn().mockReturnValue({
        getType: () => 'express',
        getInstance: () => ({ get: vi.fn(), use: vi.fn() }),
      }),
    } as any;

    setupSwagger(mockApp);

    expect(setupSpy).toHaveBeenCalledTimes(1);
    const [, , , swaggerCustomOptions] = setupSpy.mock.calls[0];

    const urls = swaggerCustomOptions?.swaggerOptions?.urls as Array<{
      name: string;
      url: string;
    }>;
    expect(urls).toBeDefined();

    const messageServiceEntry = urls.find((u) => u.name === 'Message Service');
    expect(messageServiceEntry).toEqual({
      name: 'Message Service',
      url: '/docs/specs/message-service',
    });

    // Verify existing services remain present
    const expectedServices = [
      'Auth Service',
      'User & Trust Service',
      'AI Identity Service',
      'Catalog Service',
      'Order Service',
      'Bidding Service',
      'Matching Service',
      'Payment Service',
      'Notification Service',
      'Wallet Service',
      'Tracking Service',
      'Message Service',
    ];

    for (const service of expectedServices) {
      expect(
        urls.some((u) => u.name === service),
        `Dropdown should contain ${service}`,
      ).toBe(true);
    }
  });

  it('GET /docs/specs/message-service resolves and rewrites Message Service spec', async () => {
    const configServiceMock = {
      getUrl: vi.fn().mockImplementation((key: string) => {
        if (key === 'MESSAGE_SERVICE_URL') return 'http://10.77.0.4:3009';
        throw new Error(`Unexpected key: ${key}`);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SwaggerSpecsController],
      providers: [
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    const controller = moduleRef.get(SwaggerSpecsController);

    const downstreamSpec = {
      openapi: '3.0.0',
      info: { title: 'HANDY_GO Message Service API', version: '1.0.0' },
      servers: [{ url: 'http://10.77.0.4:3009' }],
      paths: {
        '/health': { get: { summary: 'Internal health check' } },
        '/api/v1/conversations': {
          get: { summary: 'List conversations' },
          post: { summary: 'Create conversation' },
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(downstreamSpec), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = (await controller.getServiceSpec('message-service')) as any;

    expect(result.servers).toEqual([
      { url: '/', description: 'message-service (qua API Gateway)' },
    ]);
    expect(result.paths['/health']).toBeUndefined();
    expect(result.paths['/api/v1/conversations']).toBeDefined();
  });
});
