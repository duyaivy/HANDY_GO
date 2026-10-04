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
 *     của Swagger UI tự động gọi qua cổng Gateway (không cần biết port service).
 *  4. Trả JSON spec về cho Swagger UI render.
 *
 * Lợi ích: Khi bất kỳ service nào thêm endpoint mới, Swagger UI tại Gateway
 * sẽ TỰ ĐỘNG cập nhật ngay lập tức mà không cần sửa một dòng code ở Gateway.
 */
@ApiExcludeController()
@Controller('docs/specs')
export class SwaggerSpecsController {
  constructor(private readonly config: ConfigService) {}

  @Get(':serviceName')
  async getServiceSpec(
    @Param('serviceName') serviceName: string,
  ): Promise<unknown> {
    // Tra cứu route config theo tên service
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

    // Fetch OpenAPI spec từ microservice
    try {
      const specUrl = new URL('/docs-json', serviceUrl);
      const response = await fetch(specUrl, {
        signal: AbortSignal.timeout(5000), // 5s timeout để không treo cả UI
      });

      if (!response.ok) {
        return this.buildOfflineSpec(serviceName);
      }

      const spec = (await response.json()) as Record<string, unknown>;

      // Chuẩn hóa servers: thay thế bằng "/" để Swagger UI dùng cổng Gateway
      // khi người dùng bấm "Try it out" — không cần biết port nội bộ của service
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

  /**
   * Trả về OpenAPI spec tối giản khi service đang offline.
   * Giúp Swagger UI vẫn hoạt động và hiển thị thông báo rõ ràng.
   */
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
