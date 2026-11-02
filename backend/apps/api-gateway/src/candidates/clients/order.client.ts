import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { AppException, ERROR_CODES } from '@app/common';
import crypto from 'node:crypto';

export interface ServiceRequestDetail {
  id: string;
  customerUserId: string;
  status: string;
  serviceId?: string;
  [key: string]: any;
}

export interface UserContext {
  userId: string;
  roles: string[];
  accountId?: string;
  permissions?: string[];
}

@Injectable()
export class OrderClient {
  private readonly logger = new Logger(OrderClient.name);

  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    const raw = this.config.getUrl('ORDER_SERVICE_URL').replace(/\/+$/, '');
    return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
  }

  async getServiceRequest(
    requestId: string,
    user: UserContext,
    correlationId?: string,
  ): Promise<ServiceRequestDetail> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/service-requests/${requestId}`;
    const reqId = correlationId || crypto.randomUUID();
    const timeoutMs = this.config.upstreamTimeoutMs || 4000;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': this.config.internalServiceSecret,
          'x-user-id': user.userId,
          'x-user-roles': user.roles.join(','),
          'x-user-permissions': (user.permissions ?? []).join(','),
          'x-user-account-id': user.accountId ?? '',
          'x-request-id': reqId,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 200) {
        const body = (await response.json()) as { data?: ServiceRequestDetail };
        const data = body.data || (body as unknown as ServiceRequestDetail);
        return data;
      }

      if (response.status === 404) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
          'Không tìm thấy yêu cầu dịch vụ',
        );
      }

      if (response.status === 403) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.FORBIDDEN,
          'Bạn không có quyền truy cập yêu cầu dịch vụ này',
        );
      }

      if (response.status === 400) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
          'Yêu cầu dịch vụ không hợp lệ',
        );
      }

      this.logger.error(
        `Order Service returned HTTP ${response.status} for request ${requestId}`,
      );
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        ERROR_CODES.BAD_GATEWAY,
        'Không thể kết nối đến Order Service',
      );
    } catch (err: any) {
      if (err instanceof AppException) {
        throw err;
      }

      const isTimeout =
        err.name === 'TimeoutError' ||
        err.message?.includes('timeout') ||
        err.message?.includes('ETIMEDOUT');

      this.logger.error(
        `Failed to call Order Service for request ${requestId}: ${err.message}`,
      );

      throw new AppException(
        isTimeout ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY,
        isTimeout ? ERROR_CODES.GATEWAY_TIMEOUT : ERROR_CODES.BAD_GATEWAY,
        isTimeout
          ? 'Order Service xử lý quá thời gian quy định (Timeout)'
          : 'Không thể kết nối đến Order Service',
      );
    }
  }
}
