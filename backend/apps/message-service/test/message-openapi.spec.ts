import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createMessageApp } from '../src/application.js';
import { AuthorityClient } from '../src/authority.js';
import { MessagePrisma } from '../src/persistence.js';
import { CursorCodec } from '../src/security.js';
import type { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';

const apps: NestExpressApplication[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close().catch(() => {});
  }
  vi.restoreAllMocks();
});

function createMockOptions() {
  const db = {
    async $connect() {},
    async $disconnect() {},
    async $queryRaw() {
      return [{ value: 1 }];
    },
  } as unknown as MessagePrisma;

  const authority = new AuthorityClient({
    secret: 'test-secret-at-least-32-chars-long-1234',
    bidding: 'http://bidding.test',
    order: 'http://order.test',
    auth: 'http://auth.test',
    media: 'http://media.test',
  });

  const verifier = {} as TokenVerifierService;

  return {
    db,
    authority,
    verifier,
    cursorSecret: 's'.repeat(32),
    origins: ['http://localhost:3000'],
  };
}

describe('Message Service OpenAPI and Swagger UI', () => {
  it('exposes Swagger UI at /docs and OpenAPI spec at /docs-json without requiring authentication', async () => {
    vi.stubEnv('LOG_LEVEL', 'silent');
    const app = await createMessageApp(createMockOptions());
    apps.push(app);

    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();

    // 1. Verify /docs serves Swagger UI HTML
    const docsRes = await fetch(`${baseUrl}/docs`);
    expect(docsRes.status).toBe(200);
    const docsHtml = await docsRes.text();
    expect(docsHtml).toContain('swagger-ui');

    // 2. Verify /docs-json serves valid OpenAPI specification
    const specRes = await fetch(`${baseUrl}/docs-json`);
    expect(specRes.status).toBe(200);
    expect(specRes.headers.get('content-type')).toContain('application/json');

    const spec = (await specRes.json()) as {
      openapi: string;
      info: { title: string; version: string; description: string };
      paths: Record<string, Record<string, any>>;
      components?: {
        schemas?: Record<string, any>;
        securitySchemes?: Record<string, any>;
      };
    };

    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('HANDY_GO Message Service API');
    expect(spec.info.version).toBe('1.0.0');

    // 3. Verify internal endpoints like /health are excluded
    expect(spec.paths['/health']).toBeUndefined();

    // 4. Verify all implemented public Message REST operations exist
    const expectedOperations: Array<{ path: string; method: string }> = [
      { path: '/api/v1/conversations', method: 'post' },
      { path: '/api/v1/conversations', method: 'get' },
      { path: '/api/v1/conversations/{id}', method: 'get' },
      { path: '/api/v1/conversations/{id}/messages', method: 'get' },
      { path: '/api/v1/conversations/{id}/read', method: 'patch' },
    ];

    for (const { path, method } of expectedOperations) {
      const pathItem = spec.paths[path];
      expect(pathItem, `Path ${path} should exist in OpenAPI spec`).toBeDefined();
      const operation = pathItem[method];
      expect(
        operation,
        `Method ${method.toUpperCase()} ${path} should exist in OpenAPI spec`,
      ).toBeDefined();

      // All public operations require Bearer JWT auth
      expect(operation.security).toEqual([{ 'JWT-Auth': [] }]);

      // Verify success response is documented with appropriate envelope
      const successStatus = method === 'post' ? '201' : '200';
      const successResponse = operation.responses[successStatus];
      expect(
        successResponse,
        `Success response ${successStatus} for ${method.toUpperCase()} ${path}`,
      ).toBeDefined();

      // Error responses are documented
      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['401']).toBeDefined();
    }

    // 5. Verify security schemes
    expect(spec.components?.securitySchemes?.['JWT-Auth']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    // 6. Verify key request/response schemas
    const schemas = spec.components?.schemas ?? {};
    expect(schemas.ConversationCreateDto).toBeDefined();
    expect(schemas.ConversationCreateDto.properties.bidId).toMatchObject({
      type: 'string',
      format: 'uuid',
    });
    expect(schemas.ConversationCreateDto.required).toContain('bidId');

    expect(schemas.MessageReadDto).toBeDefined();
    expect(schemas.MessageReadDto.properties.lastReadSequence).toMatchObject({
      type: 'string',
    });
    expect(schemas.MessageReadDto.required).toContain('lastReadSequence');

    expect(schemas.ChatConversationDto).toBeDefined();
    expect(schemas.ChatMessageDto).toBeDefined();
    expect(schemas.ChatReadStateDto).toBeDefined();
    expect(schemas.ConversationPageDto).toBeDefined();
    expect(schemas.MessageHistoryPageDto).toBeDefined();

    // 7. Verify Finding 1: Conversation creation description accuracy
    const postConv = spec.paths['/api/v1/conversations']?.post;
    expect(postConv.description).toContain('open_for_bidding');
    expect(postConv.description).not.toContain('báo giá đã được xác nhận');
    expect(schemas.ConversationCreateDto.properties.bidId.description).not.toContain(
      'đã được xác nhận',
    );

    // 8. Verify Finding 2: Architecture documentation in Swagger description
    expect(spec.info.description).toContain('https://handygo.duyaivy.id.vn/docs');
    expect(spec.info.description).toContain('http://10.77.0.4:3009/docs-json');
    expect(spec.info.description).toContain('/api/v1/conversations');
    expect(spec.info.description).toContain('/api/v1/chat/socket.io/');
    expect(spec.info.description).not.toContain('định tuyến thông qua API Gateway');

    // 9. Verify Finding 3: Cursor HMAC signing and example validity
    const nextCursorExample =
      schemas.ConversationPageDto?.properties?.nextCursor?.example;
    expect(nextCursorExample).toBeDefined();

    const codec = new CursorCodec('s'.repeat(32));
    const decoded = codec.decode(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      nextCursorExample,
    );
    expect(decoded.id).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(decoded.timestamp).toBeInstanceOf(Date);

    // Query cursor must not have hardcoded example breaking Swagger "Try it out"
    if (schemas.ConversationListQueryDto?.properties?.cursor) {
      expect(
        schemas.ConversationListQueryDto.properties.cursor.example,
      ).toBeUndefined();
    }

    // Unsigned plain base64 JSON must be rejected by CursorCodec
    const unauthenticatedJson = Buffer.from(
      JSON.stringify({
        v: 1,
        userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sortTimestamp: new Date().toISOString(),
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      }),
    ).toString('base64url');
    expect(() =>
      codec.decode('a1b2c3d4-e5f6-7890-abcd-ef1234567890', unauthenticatedJson),
    ).toThrow();
  });

  it('reconciles with checked-in docs/message-service/openapi.json without silent drift', () => {
    const staticDoc = JSON.parse(
      readFileSync(
        new URL(
          '../../../../docs/message-service/openapi.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );

    // Static doc must not contain outdated Phase claims
    expect(staticDoc.info.title).not.toContain('Phase 1');
    expect(staticDoc.info.description).not.toContain('not implemented');

    // All 5 operations must exist in static doc
    const operations = [
      ['/api/v1/conversations', 'post'],
      ['/api/v1/conversations', 'get'],
      ['/api/v1/conversations/{id}', 'get'],
      ['/api/v1/conversations/{id}/messages', 'get'],
      ['/api/v1/conversations/{id}/read', 'patch'],
    ];

    for (const [path, method] of operations) {
      expect(staticDoc.paths[path]?.[method]).toBeDefined();
      expect(staticDoc.paths[path][method].security).toEqual([
        { 'JWT-Auth': [] },
      ]);
    }

    // Health must not be exposed in static doc
    expect(staticDoc.paths['/health']).toBeUndefined();

    // Socket.IO contract must be specified separately via x-socket-io
    expect(staticDoc['x-socket-io']).toBeDefined();
    expect(staticDoc['x-socket-io'].path).toBe('/api/v1/chat/socket.io/');
  });
});
