import {
  BadRequestException,
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
    const rawUrl =
      this.config.get('ORDER_SERVICE_URL') || 'http://localhost:3004';
    const orderServiceUrl = rawUrl.replace(/\/+$/, '');
    const internalSecret = this.config.internalServiceSecret;

    try {
      const url = `${orderServiceUrl}/api/v1/internal/service-requests/${serviceRequestId}/bidding-eligibility?workerId=${workerId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-internal-secret': internalSecret || '',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 200) {
        const body = (await response.json()) as { data?: RequestEligibilityResult };
        const data = body.data || (body as unknown as RequestEligibilityResult);
        if (!data.eligible) {
          throw new ForbiddenException(
            data.reason || 'Thợ không đủ điều kiện tham gia báo giá cho yêu cầu này',
          );
        }
        return data;
      }

      if (
        response.status === 400 ||
        response.status === 403 ||
        response.status === 404 ||
        response.status === 409
      ) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new ForbiddenException(
          errorBody.message || 'Yêu cầu dịch vụ không đủ điều kiện nhận báo giá',
        );
      }

      // If Order Service returned 5xx
      this.logger.error(
        `Order Service returned ${response.status} when verifying request ${serviceRequestId}. Failing closed.`,
      );
      throw new ServiceUnavailableException(
        'Không thể kết nối tới Order Service để xác minh điều kiện báo giá. Vui lòng thử lại sau.',
      );
    } catch (err: any) {
      if (
        err instanceof ForbiddenException ||
        err instanceof BadRequestException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }

      // R02/F04 Fail-closed: Network failure, DNS failure, timeout or broker outage
      this.logger.error(
        `Order Service bidding-eligibility check failed (${err.message}). Failing closed.`,
      );
      throw new ServiceUnavailableException(
        'Dịch vụ Order tạm thời không phản hồi. Vui lòng thử lại sau.',
      );
    }
  }
}
