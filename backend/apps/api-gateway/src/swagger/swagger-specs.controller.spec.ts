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

  it('GET /docs/specs/auth-service trả OpenAPI spec đầy đủ 5 endpoints: refresh, logout, forgot-password, verify-reset-otp, reset-password với schema và auth requirements đúng', async () => {
    const authServiceSpec = {
      openapi: '3.0.0',
      info: { title: 'Auth Service API', version: '1.0' },
      servers: [{ url: 'http://auth-service:3001' }],
      paths: {
        '/auth/refresh': {
          post: {
            summary: 'Làm mới Access Token bằng Refresh Token',
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshTokenDto' } } },
            },
            responses: {
              '200': { description: 'Làm mới token thành công', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthSuccessResponseDto' } } } },
              '400': { description: 'Dữ liệu không hợp lệ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '401': { description: 'Refresh token không hợp lệ hoặc hết hạn', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '403': { description: 'Tài khoản bị vô hiệu hóa', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '500': { description: 'Lỗi máy chủ nội bộ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
            },
          },
        },
        '/auth/logout': {
          post: {
            summary: 'Đăng xuất và thu hồi session',
            description: 'Yêu cầu Refresh Token trong body. Không yêu cầu Bearer token xác thực.',
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/LogoutDto' } } },
            },
            responses: {
              '200': { description: 'Đăng xuất thành công', content: { 'application/json': { schema: { $ref: '#/components/schemas/LogoutResponseDto' } } } },
              '400': { description: 'Dữ liệu không hợp lệ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '500': { description: 'Lỗi máy chủ nội bộ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
            },
            // Logout route không có security requirement dạng bearer auth
            security: [],
          },
        },
        '/auth/forgot-password': {
          post: {
            summary: 'Yêu cầu mã xác thực đặt lại mật khẩu qua email',
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ForgotPasswordDto' } } },
            },
            responses: {
              '200': { description: 'Phản hồi công khai', content: { 'application/json': { schema: { $ref: '#/components/schemas/ForgotPasswordResponseDto' } } } },
              '400': { description: 'Dữ liệu không hợp lệ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '429': { description: 'Vượt quá rate limit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '500': { description: 'Lỗi máy chủ nội bộ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
            },
          },
        },
        '/auth/verify-reset-otp': {
          post: {
            summary: 'Xác thực mã OTP đặt lại mật khẩu và nhận reset token',
            description: 'Kiểm tra mã OTP 6 chữ số cho mục đích reset_password. Khi hợp lệ, cấp mã resetToken ngắn hạn 15 phút dùng một lần. Giới hạn tối đa 10 yêu cầu/giờ theo địa chỉ IP.',
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyResetOtpDto' } } },
            },
            responses: {
              '200': { description: 'Xác thực OTP thành công', content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyResetOtpResponseDto' } } } },
              '400': { description: 'Mã OTP không hợp lệ, đã hết hạn hoặc thông tin không chính xác', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '429': { description: 'Vượt quá giới hạn yêu cầu theo IP (tối đa 10 lần/giờ)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '500': { description: 'Lỗi máy chủ nội bộ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
            },
          },
        },
        '/auth/reset-password': {
          post: {
            summary: 'Đặt lại mật khẩu mới bằng reset token một lần',
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordDto' } } },
            },
            responses: {
              '200': { description: 'Đặt lại mật khẩu thành công', content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordResponseDto' } } } },
              '400': { description: 'Mã reset token không hợp lệ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
              '500': { description: 'Lỗi máy chủ nội bộ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } } } },
            },
          },
        },
        '/health': {
          get: { summary: 'Internal health check' },
        },
      },
      components: {
        schemas: {
          RefreshTokenDto: { type: 'object' },
          LogoutDto: { type: 'object' },
          ForgotPasswordDto: { type: 'object' },
          VerifyResetOtpDto: { type: 'object' },
          ResetPasswordDto: { type: 'object' },
          AuthSuccessResponseDto: { type: 'object' },
          LogoutResponseDto: { type: 'object' },
          ForgotPasswordResponseDto: { type: 'object' },
          VerifyResetOtpResponseDto: { type: 'object' },
          ResetPasswordResponseDto: { type: 'object' },
          ApiErrorResponseDto: { type: 'object' },
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(authServiceSpec), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = (await controller.getServiceSpec('auth-service')) as any;

    // Gateway chuẩn hóa servers về '/'
    expect(result.servers).toEqual([
      { url: '/', description: 'auth-service (qua API Gateway)' },
    ]);

    // Gateway loại bỏ route /health nội bộ
    expect(result.paths['/health']).toBeUndefined();

    // Spec hiển thị đủ năm endpoint với method POST
    expect(result.paths['/auth/refresh']?.post).toBeDefined();
    expect(result.paths['/auth/logout']?.post).toBeDefined();
    expect(result.paths['/auth/forgot-password']?.post).toBeDefined();
    expect(result.paths['/auth/verify-reset-otp']?.post).toBeDefined();
    expect(result.paths['/auth/reset-password']?.post).toBeDefined();

    // Logout không yêu cầu Bearer token (security = [])
    expect(result.paths['/auth/logout']?.post?.security).toEqual([]);

    // Schemas đầy đủ
    expect(result.components?.schemas?.RefreshTokenDto).toBeDefined();
    expect(result.components?.schemas?.LogoutDto).toBeDefined();
    expect(result.components?.schemas?.ForgotPasswordDto).toBeDefined();
    expect(result.components?.schemas?.VerifyResetOtpDto).toBeDefined();
    expect(result.components?.schemas?.ResetPasswordDto).toBeDefined();
  });
});
