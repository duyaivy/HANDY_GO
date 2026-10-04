import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * setupSwagger
 *
 * Cấu hình Swagger UI tại /docs với Multi-Spec Selector (Giải pháp 1).
 *
 * Cơ chế hoạt động:
 *  - Swagger UI hiển thị một dropdown nổi bật ở thanh Topbar để chọn xem
 *    tài liệu API của từng microservice.
 *  - Mỗi lựa chọn trong dropdown gọi GET /docs/specs/:serviceName tại Gateway.
 *  - SwaggerSpecsController sẽ fetch OpenAPI spec từ service tương ứng và trả về.
 *  - Khi service thêm endpoint mới → Swagger UI tự động cập nhật KHÔNG cần sửa Gateway.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('HANDY GO — API Gateway & Microservices Docs')
    .setDescription(
      'Unified API Gateway cho nền tảng HANDY GO.\n\n' +
        '👉 **Sử dụng Dropdown ở góc trên bên phải thanh Topbar (ô viền xanh)** để chọn xem tài liệu API của từng Microservice.\n\n' +
        '> 💡 Tất cả requests từ "Try it out" sẽ đi qua cổng Gateway (port 3000) và được tự động định tuyến đến service tương ứng.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập JWT Access Token (lấy từ POST /api/v1/auth/login)',
      },
      'JWT-Auth',
    )
    .addTag('Gateway', 'Health check và root endpoints của API Gateway')
    .build();

  const gatewayDocument = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, gatewayDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      layout: 'StandaloneLayout',
      urlsPrimaryName: '🔐 Auth Service',
      urls: [
        {
          name: '🔐 Auth Service',
          url: '/docs/specs/auth-service',
        },
        {
          name: '👤 User & Trust Service',
          url: '/docs/specs/user-trust-service',
        },
        {
          name: '📦 Catalog Service',
          url: '/docs/specs/catalog-service',
        },
        {
          name: '📋 Order Service',
          url: '/docs/specs/order-service',
        },
        {
          name: '💰 Bidding Service',
          url: '/docs/specs/bidding-service',
        },
        {
          name: '🔗 Matching Service',
          url: '/docs/specs/matching-service',
        },
        {
          name: '💳 Payment Service',
          url: '/docs/specs/payment-service',
        },
        {
          name: '🔔 Notification Service',
          url: '/docs/specs/notification-service',
        },
        {
          name: '👛 Wallet Service',
          url: '/docs/specs/wallet-service',
        },
        {
          name: '📍 Tracking Service',
          url: '/docs/specs/tracking-service',
        },
        {
          name: '🌐 Gateway Root & Health',
          url: '/docs-json',
        },
      ],
    },
    customCss: `
      .swagger-ui .topbar { background-color: #1b1b1b !important; padding: 10px 20px !important; }
      .swagger-ui .topbar .download-url-wrapper { display: flex !important; align-items: center !important; justify-content: flex-end !important; width: 100% !important; }
      .swagger-ui .topbar .download-url-wrapper label { color: #ffffff !important; font-weight: bold !important; font-size: 14px !important; margin-right: 10px !important; display: flex !important; align-items: center !important; }
      .swagger-ui .topbar .download-url-wrapper select { display: block !important; visibility: visible !important; opacity: 1 !important; background: #2d3748 !important; color: #49cc90 !important; font-size: 15px !important; font-weight: bold !important; padding: 8px 16px !important; border: 2px solid #49cc90 !important; border-radius: 6px !important; cursor: pointer !important; min-width: 250px !important; }
      .swagger-ui .topbar .download-url-wrapper input, .swagger-ui .topbar .download-url-wrapper .download-url-button { display: none !important; }
    `,
    customSiteTitle: 'HANDY GO API Docs',
  });
}
