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

  /**
   * PR42-06: Verifies worker hard eligibility via User & Trust Service.
   * Checks that worker account is active, KYC is approved, and the worker offers the requested service.
   * Strictly fail-closed on service unavailability, timeout, or network failure.
   */
  async verifyWorkerHardEligibility(
    workerId: string,
    requiredServiceId?: string,
  ): Promise<void> {
    const rawUserTrustUrl =
      (typeof this.config.getUrl === 'function'
        ? this.config.getUrl('USER_TRUST_SERVICE_URL')
        : (this.config as any).get?.('USER_TRUST_SERVICE_URL')) ||
      'http://localhost:3002';
    const userTrustUrl = rawUserTrustUrl.replace(/\/+$/, '');
    const internalSecret = this.config.internalServiceSecret;

    const url = `${userTrustUrl}/api/v1/internal/v1/workers/${encodeURIComponent(workerId)}/matching-profile`;

    try {
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
            ? (body as any).data
            : body;

        if (!data || typeof data !== 'object') {
          throw new ForbiddenException(
            'Hồ sơ thợ không tồn tại hoặc không ở trạng thái hoạt động',
          );
        }

        // Hard check: KYC verified
        if (!data.isVerified) {
          throw new ForbiddenException(
            'Thợ chưa hoàn tất xác thực danh tính (KYC) để gửi báo giá',
          );
        }

        // Hard check: Service offering matches requested service
        if (
          requiredServiceId &&
          Array.isArray(data.serviceIds) &&
          !data.serviceIds.includes(requiredServiceId)
        ) {
          throw new ForbiddenException(
            'Thợ chưa đăng ký ngành nghề dịch vụ phù hợp với yêu cầu này',
          );
        }

        return;
      }

      if (response.status === 404) {
        throw new ForbiddenException('Hồ sơ thợ không tồn tại hoặc đã bị khóa');
      }

      if (response.status === 401 || response.status === 403) {
        this.logger.warn({
          event: 'worker_profile_verification_auth_failed',
          httpStatus: response.status,
          workerId,
        });
        throw new ForbiddenException(
          'Không đủ quyền hạn để xác thực hồ sơ thợ',
        );
      }

      // 5xx -> fail closed
      this.logger.error({
        event: 'worker_profile_verification_failed',
        category: 'http_5xx',
        httpStatus: response.status,
        workerId,
      });
      throw new ServiceUnavailableException(
        'Không thể kết nối tới User & Trust Service để xác minh điều kiện thợ. Vui lòng thử lại sau.',
      );
    } catch (err: unknown) {
      if (
        err instanceof ForbiddenException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }

      this.logger.error({
        event: 'worker_profile_verification_failed',
        category: 'network_error',
        message: (err as Error).message,
        workerId,
      });
      throw new ServiceUnavailableException(
        'Dịch vụ User & Trust tạm thời không phản hồi. Xác minh điều kiện thợ thất bại (fail-closed).',
      );
    }
  }
}
