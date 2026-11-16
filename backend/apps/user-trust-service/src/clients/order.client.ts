import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@app/config';

export interface InternalOrderDetail {
  orderId: string;
  orderCode: string;
  status: string;
  paymentState: string;
  customerUserId: string;
  workerUserId: string;
  serviceId: string;
  agreedPrice: string;
  currency: string;
  completedAt: string | null;
  isEligibleForSettlement: boolean;
  reason?: string;
}

@Injectable()
export class OrderClient {
  private readonly logger = new Logger(OrderClient.name);

  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    const raw = (
      this.config.get('ORDER_SERVICE_URL') || 'http://localhost:3004'
    ).replace(/\/+$/, '');
    return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
  }

  async getOrder(orderId: string): Promise<InternalOrderDetail> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        orderId,
      );
    if (!isUuid) {
      throw new BadRequestException('Mã đơn hàng không đúng định dạng UUID');
    }

    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/internal/orders/${orderId}/payment-eligibility`;
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
        `Error connecting to order-service at ${url}: ${(err as Error)?.message}`,
      );
      throw new ServiceUnavailableException('Dịch vụ đơn hàng hiện không khả dụng');
    }

    if (response.status === 404) {
      throw new NotFoundException('Không tìm thấy thông tin đơn hàng');
    }

    if (!response.ok) {
      this.logger.error(
        `Order-service returned status ${response.status} at ${url}`,
      );
      throw new ServiceUnavailableException(
        'Không thể xác thực thông tin đơn hàng từ Order Service',
      );
    }

    const payload = (await response.json()) as { data?: InternalOrderDetail };
    if (!payload?.data) {
      throw new NotFoundException('Dữ liệu đơn hàng không tồn tại');
    }

    return payload.data;
  }
}

