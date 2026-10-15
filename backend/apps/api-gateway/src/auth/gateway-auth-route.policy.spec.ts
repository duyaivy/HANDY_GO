import { describe, it, expect } from 'vitest';
import {
  isPublicRoute,
  PUBLIC_ROUTE_RULES,
} from './gateway-auth-route.policy.js';

describe('GatewayAuthRoutePolicy (Unit)', () => {
  describe('PUBLIC_ROUTE_RULES structure', () => {
    it('defines non-empty list of route rules', () => {
      expect(PUBLIC_ROUTE_RULES.length).toBeGreaterThan(0);
      for (const rule of PUBLIC_ROUTE_RULES) {
        expect(rule.path).toBeTruthy();
        expect(['exact', 'prefix']).toContain(rule.match);
      }
    });
  });

  describe('isPublicRoute', () => {
    describe('Auth public endpoints (exact match, POST only)', () => {
      const authEndpoints = [
        '/api/v1/auth/login',
        '/api/v1/auth/register',
        '/api/v1/auth/verify-email',
        '/api/v1/auth/resend-otp',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/auth/forgot-password',
        '/api/v1/auth/verify-reset-otp',
        '/api/v1/auth/reset-password',
      ];

      it.each(authEndpoints)(
        'POST %s được xác định là public route',
        (endpoint) => {
          expect(isPublicRoute(endpoint, 'POST')).toBe(true);
        },
      );

      it('chấp nhận endpoint có query parameters', () => {
        expect(isPublicRoute('/api/v1/auth/login?redirect=/home', 'POST')).toBe(
          true,
        );
      });

      it.each(authEndpoints)(
        'từ chối subpath của auth endpoint %s (exact match)',
        (endpoint) => {
          expect(isPublicRoute(`${endpoint}/subpath`, 'POST')).toBe(false);
          expect(isPublicRoute(`${endpoint}/extra/deep`, 'POST')).toBe(false);
        },
      );

      it.each(authEndpoints)(
        'từ chối HTTP method không hợp lệ đối với auth endpoint %s (chỉ cho phép POST)',
        (endpoint) => {
          expect(isPublicRoute(endpoint, 'GET')).toBe(false);
          expect(isPublicRoute(endpoint, 'PUT')).toBe(false);
          expect(isPublicRoute(endpoint, 'PATCH')).toBe(false);
          expect(isPublicRoute(endpoint, 'DELETE')).toBe(false);
        },
      );
    });

    describe('Catalog, categories, and services routes (prefix match, GET/HEAD only)', () => {
      const publicPrefixCases = [
        { path: '/api/v1/catalog', method: 'GET' },
        { path: '/api/v1/catalog', method: 'HEAD' },
        { path: '/api/v1/catalog/123', method: 'GET' },
        { path: '/api/v1/catalog/123/details', method: 'GET' },
        { path: '/api/v1/catalog?category=tools', method: 'GET' },
        { path: '/api/v1/categories', method: 'GET' },
        { path: '/api/v1/categories', method: 'HEAD' },
        { path: '/api/v1/categories/appliances', method: 'GET' },
        { path: '/api/v1/services', method: 'GET' },
        { path: '/api/v1/services', method: 'HEAD' },
        { path: '/api/v1/services/plumbing/options', method: 'GET' },
      ];

      it.each(publicPrefixCases)(
        '$method $path là public route',
        ({ path, method }) => {
          expect(isPublicRoute(path, method)).toBe(true);
        },
      );

      it('từ chối các method biến đổi dữ liệu (POST/PUT/PATCH/DELETE) trên catalog/categories/services', () => {
        expect(isPublicRoute('/api/v1/catalog', 'POST')).toBe(false);
        expect(isPublicRoute('/api/v1/catalog/123', 'PUT')).toBe(false);
        expect(isPublicRoute('/api/v1/categories/1', 'DELETE')).toBe(false);
        expect(isPublicRoute('/api/v1/services/new', 'POST')).toBe(false);
        expect(isPublicRoute('/api/v1/services/1', 'PATCH')).toBe(false);
      });

      it('từ chối route trùng tiền tố nhưng không có dấu / phân cách', () => {
        expect(isPublicRoute('/api/v1/catalog-admin', 'GET')).toBe(false);
        expect(isPublicRoute('/api/v1/categories-internal', 'GET')).toBe(false);
        expect(isPublicRoute('/api/v1/services-private', 'GET')).toBe(false);
      });
    });

    describe('Infrastructure & Dev Tooling routes', () => {
      const infraRoutes = [
        { path: '/health', method: 'GET' },
        { path: '/health/ready', method: 'GET' },
        { path: '/docs', method: 'GET' },
        { path: '/docs/swagger-ui.css', method: 'GET' },
        { path: '/docs/specs/auth-service', method: 'GET' },
        { path: '/docs-json', method: 'GET' },
        { path: '/favicon.ico', method: 'GET' },
        { path: '/dev', method: 'GET' },
        { path: '/dev/video-upload', method: 'GET' },
      ];

      it.each(infraRoutes)(
        '$method $path là public route',
        ({ path, method }) => {
          expect(isPublicRoute(path, method)).toBe(true);
        },
      );
    });

    describe('Protected routes (bắt buộc xác thực)', () => {
      const protectedRoutes = [
        { path: '/api/v1/orders', method: 'GET' },
        { path: '/api/v1/orders', method: 'POST' },
        { path: '/api/v1/uploads/image', method: 'POST' },
        { path: '/api/v1/uploads/video/init', method: 'POST' },
        { path: '/api/v1/users/profile', method: 'GET' },
        { path: '/api/v1/payments/checkout', method: 'POST' },
      ];

      it.each(protectedRoutes)(
        '$method $path KHÔNG phải public route',
        ({ path, method }) => {
          expect(isPublicRoute(path, method)).toBe(false);
        },
      );
    });
  });
});
