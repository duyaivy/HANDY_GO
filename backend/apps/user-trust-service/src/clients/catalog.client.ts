import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@app/config';

export interface CatalogServiceDetail {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryIsActive: boolean;
  isActive: boolean;
}

@Injectable()
export class CatalogClient {
  private readonly logger = new Logger(CatalogClient.name);

  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    const raw = (
      this.config.get('CATALOG_SERVICE_URL') || 'http://localhost:3003'
    ).replace(/\/+$/, '');
    return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
  }

  async getService(serviceId: string): Promise<CatalogServiceDetail> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/services/${serviceId}`;
    const timeoutMs = this.config.upstreamTimeoutMs || 5000;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': this.config.internalServiceSecret,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: unknown) {
      this.logger.error(
        `Error connecting to catalog-service at ${url}: ${(err as Error)?.message}`,
      );
      throw new ServiceUnavailableException(
        'Không thể kết nối đến dịch vụ danh mục hệ thống (Catalog Service). Vui lòng thử lại sau.',
      );
    }

    if (response.status === 404) {
      throw new BadRequestException(
        `Dịch vụ với ID "${serviceId}" không tồn tại trong danh mục hệ thống`,
      );
    }

    if (!response.ok) {
      this.logger.error(
        `Catalog service responded with status ${response.status} for ${url}`,
      );
      throw new ServiceUnavailableException(
        'Dịch vụ danh mục hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
      );
    }

    const json = (await response.json()) as { data?: any };
    const svc = json.data || json;

    return {
      id: svc.id,
      name: svc.name,
      categoryId: svc.categoryId || svc.category?.id,
      categoryName: svc.category?.name || '',
      categoryIsActive: svc.category?.isActive ?? true,
      isActive: svc.isActive ?? true,
    };
  }

  async getServices(serviceIds: string[]): Promise<CatalogServiceDetail[]> {
    return Promise.all(serviceIds.map((id) => this.getService(id)));
  }
}

