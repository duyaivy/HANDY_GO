import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { SERVICE_ROUTES } from '../proxy/proxy.constants.js';

/**
 * SwaggerSpecsController
 *
 * Cung cấp endpoint proxy `/docs/specs/:serviceName` để Swagger UI tại API Gateway
 * có thể fetch OpenAPI spec trực tiếp từ từng downstream microservice mà không
 * cần khai báo lại endpoint thủ công ở Gateway.
 *
 * Cơ chế hoạt động:
 *  1. Client (trình duyệt Swagger UI) gọi: GET /docs/specs/auth-service
 *  2. Gateway fetch nội bộ: GET http://<AUTH_SERVICE_URL>/docs-json
 *  3. Gateway chuẩn hóa trường `servers` → [{ url: "/" }] để "Try it out"
 *     của Swagger UI tự động gọi qua cổng Gateway.
 *  4. Loại bỏ endpoint nội bộ `/health` của container để tránh xung đột với
 *     endpoint `/health` riêng của Gateway.
 *  5. Trả JSON spec về cho Swagger UI render.
 */
@ApiExcludeController()
@Controller('docs/specs')
export class SwaggerSpecsController {
  constructor(private readonly config: ConfigService) {}

  @Get(':serviceName')
  async getServiceSpec(
    @Param('serviceName') serviceName: string,
  ): Promise<unknown> {
    const route = SERVICE_ROUTES.find(
      (r) => r.upstreamName === serviceName,
    );

    if (!route) {
      throw new NotFoundException(
        `Microservice "${serviceName}" không tồn tại trong cấu hình Gateway.`,
      );
    }

    let serviceUrl: string;
    try {
      serviceUrl = this.config.getUrl(route.envKey);
    } catch {
      return this.buildOfflineSpec(serviceName);
    }

    try {
      const specUrl = new URL('/docs-json', serviceUrl);
      const response = await fetch(specUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return this.buildOfflineSpec(serviceName);
      }

      const spec = (await response.json()) as Record<string, unknown>;

      // Loại bỏ endpoint nội bộ /health khỏi spec hiển thị của microservice
      // để tránh xung đột với /health của chính API Gateway khi bấm "Try it out"
      if (spec.paths && typeof spec.paths === 'object') {
        const pathsObj = spec.paths as Record<string, unknown>;
        delete pathsObj['/health'];
      }

      // Chuẩn hóa servers: thay thế bằng "/" để Swagger UI dùng cổng Gateway
      spec['servers'] = [
        {
          url: '/',
          description: `${serviceName} (qua API Gateway)`,
        },
      ];

      return spec;
    } catch {
      return this.buildOfflineSpec(serviceName);
    }
  }

  private buildOfflineSpec(serviceName: string): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: `${serviceName} (Offline)`,
        description: `⚠️ **${serviceName}** hiện không thể kết nối. Vui lòng kiểm tra lại sau.`,
        version: '0.0.0',
      },
      servers: [{ url: '/', description: `${serviceName} (via API Gateway)` }],
      paths: {},
    };
  }
}
