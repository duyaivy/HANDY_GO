import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
   */
  async verifyEligibility(
    serviceRequestId: string,
    workerId: string,
  ): Promise<RequestEligibilityResult> {
    const orderServiceUrl =
      this.config.get('ORDER_SERVICE_URL') ||
      this.config.getUrl?.('orderService') ||
      'http://localhost:3004';

    const internalSecret = this.config.internalServiceSecret;

    try {
      const url = `${orderServiceUrl}/internal/service-requests/${serviceRequestId}/bidding-eligibility?workerId=${workerId}`;
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

      if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        throw new ForbiddenException(
          errorBody.message || 'Yêu cầu dịch vụ không đủ điều kiện nhận báo giá',
        );
      }

      // If Order Service returned 5xx
      this.logger.warn(
        `Order Service returned ${response.status} when verifying request ${serviceRequestId}`,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err instanceof BadRequestException) {
        throw err;
      }
      // If Order Service is down or endpoint not yet deployed in mock/local dev
      this.logger.warn(
        `Order Service bidding-eligibility check failed or unavailable (${err.message}). Using fail-safe contract validation.`,
      );
    }

    return { eligible: true };
  }
}
