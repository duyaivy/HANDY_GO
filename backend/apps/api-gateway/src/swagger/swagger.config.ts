import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * setupSwagger
 *
 * Cấu hình Swagger UI tại /docs với Multi-Spec Selector (Giải pháp 1).
 *
 * Cơ chế hoạt động:
 *  - Swagger UI hiển thị một dropdown ở góc trên bên phải để chọn xem
 *    tài liệu API của từng microservice.
 *  - Mỗi lựa chọn trong dropdown gọi GET /docs/specs/:serviceName tại Gateway.
 *  - SwaggerSpecsController sẽ fetch OpenAPI spec từ service tương ứng và trả về.
 *  - Khi service thêm endpoint mới → Swagger UI tự động cập nhật KHÔNG cần sửa Gateway.
 *
 * Lưu ý: `document` được tạo ra với DocumentBuilder để serve spec cho chính
 * Gateway (health, root endpoints). Các service khác dùng `urls` dropdown.
 */
export function setupSwagger(app: INestApplication): void {
  // Spec cho chính Gateway (health check, root endpoints của Gateway)
  const config = new DocumentBuilder()
    .setTitle('HANDY GO — API Gateway')
    .setDescription(
      'Unified API Gateway cho nền tảng HANDY GO.\n\n' +
      'Sử dụng **dropdown ở góc trên bên phải** để chuyển đổi và xem tài liệu API của từng microservice.\n\n' +
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
      // Persistent token — người dùng không cần nhập lại token khi chuyển tab
      persistAuthorization: true,
      // Multi-Spec Selector: dropdown chọn từng microservice
      // Mỗi url trỏ tới SwaggerSpecsController tại /docs/specs/:serviceName
      urls: [
        {
          name: '🌐 Gateway (Health & Root)',
          url: '/docs-json',
        },
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
      ],
    },
    // Tùy chỉnh tiêu đề trang
    customSiteTitle: 'HANDY GO API Docs',
  });
}
