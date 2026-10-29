import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@app/config';

export interface RequestEligibilityResult {
  eligible: boolean;
  reason?: string;
  requestStatus?: string;
}

@Injectable()
export class RequestEligibilityVerifierService {
  private readonly logger = new Logger(RequestEligibilityVerifierService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Verifies that the worker is authoritative and eligible to bid on the specified service request
   * by querying Order/Request Service via internal API contract.
   * R02/F04: Strictly fail-closed on network errors, timeouts, or 5xx responses.
   */
  async verifyEligibility(
    serviceRequestId: string,
    workerId: string,
  ): Promise<RequestEligibilityResult> {
    const orderServiceUrl = this.config
      .getUrl('ORDER_SERVICE_URL')
      .replace(/\/+$/, '');
    const internalSecret = this.config.internalServiceSecret;

    try {
      const url = `${orderServiceUrl}/api/v1/internal/service-requests/${encodeURIComponent(serviceRequestId)}/bidding-eligibility?workerId=${encodeURIComponent(workerId)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-internal-secret': internalSecret || '',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 200) {
        const body: unknown = await response.json().catch(() => null);
        const data =
          typeof body === 'object' && body !== null && 'data' in body
            ? body.data
            : undefined;
        if (
          typeof data !== 'object' ||
          data === null ||
          !('eligible' in data) ||
          typeof data.eligible !== 'boolean'
        ) {
          this.logger.error({
            event: 'order_eligibility_failed',
            category: 'invalid_response_body',
            serviceRequestId,
          });
          throw new ServiceUnavailableException(
            'Dịch vụ Order tạm thời không phản hồi. Vui lòng thử lại sau.',
          );
        }
        const result = data as RequestEligibilityResult;
        if (!result.eligible) {
          throw new ForbiddenException(
            typeof result.reason === 'string'
              ? result.reason
              : 'Thợ không đủ điều kiện tham gia báo giá cho yêu cầu này',
          );
        }
        return result;
      }

      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404 ||
        response.status === 409
      ) {
        this.logger.warn({
          event: 'order_eligibility_failed',
          category:
            response.status === 404
              ? 'http_404'
              : response.status === 401 || response.status === 403
                ? 'http_auth'
                : 'http_rejected',
          httpStatus: response.status,
          serviceRequestId,
        });
        throw new ForbiddenException(
          'Yêu cầu dịch vụ không đủ điều kiện nhận báo giá',
        );
      }

      // If Order Service returned 5xx
      this.logger.error({
        event: 'order_eligibility_failed',
        category: response.status >= 500 ? 'http_5xx' : 'http_unexpected',
        httpStatus: response.status,
        serviceRequestId,
      });
      throw new ServiceUnavailableException(
        'Không thể kết nối tới Order Service để xác minh điều kiện báo giá. Vui lòng thử lại sau.',
      );
    } catch (err: unknown) {
      if (
        err instanceof ForbiddenException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }

      // R02/F04 Fail-closed: Network failure, DNS failure, timeout or broker outage
      const cause =
        err instanceof Error && 'cause' in err ? err.cause : undefined;
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? cause.code
          : undefined;
      const category =
        err instanceof Error && err.name === 'TimeoutError'
          ? 'ETIMEDOUT'
          : code === 'ECONNREFUSED' ||
              code === 'ENOTFOUND' ||
              code === 'ETIMEDOUT'
            ? code
            : 'network_error';
      this.logger.error({
        event: 'order_eligibility_failed',
        category,
        serviceRequestId,
      });
      throw new ServiceUnavailableException(
        'Dịch vụ Order tạm thời không phản hồi. Vui lòng thử lại sau.',
      );
    }
  }
}
