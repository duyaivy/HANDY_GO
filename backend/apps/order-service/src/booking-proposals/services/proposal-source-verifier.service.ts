import {
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AppException } from '@app/common';
import { ConfigService } from '@app/config';
import { WorkerSelectionSource } from '@prisma/order-client';
import { ORDER_ERROR_CODES } from '../../common/constants/order-errors.js';
import { ORDER_CONSTANTS } from '../../common/constants/order.constants.js';

export interface VerifyProposalSourceParams {
  selectionSource: WorkerSelectionSource;
  serviceRequestId: string;
  workerUserId: string;
  sourceBidId?: string;
  sourceMatchResultId?: string;
}

@Injectable()
export class ProposalSourceVerifierService {
  private readonly logger = new Logger(ProposalSourceVerifierService.name);

  constructor(private readonly config: ConfigService) {
    this.assertProductionSafety();
  }

  private get isProduction(): boolean {
    return (
      this.config.isProduction ||
      process.env.NODE_ENV === 'production'
    );
  }

  get isMockEnabled(): boolean {
    return this.config.get('ORDER_ENABLE_MOCK_VERIFIER') === 'true';
  }

  /**
   * Enforces that mock verifiers can NEVER be enabled in production environments.
   */
  assertProductionSafety(): void {
    if (this.isProduction && this.isMockEnabled) {
      throw new Error(
        'CRITICAL SECURITY VIOLATION: Mock verifier cannot be enabled in production environments.',
      );
    }
  }

  /**
   * Verifies the proposal source against trusted internal service contracts (BE-10).
   * Strictly fail-closed on network errors, verifier timeouts, or unverified sources.
   */
  async verifyProposalSource(params: VerifyProposalSourceParams): Promise<void> {
    this.assertProductionSafety();

    if (params.selectionSource === WorkerSelectionSource.bid) {
      await this.verifyBidSource(params);
    } else if (params.selectionSource === WorkerSelectionSource.recommendation) {
      await this.verifyRecommendationSource(params);
    } else {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Nguồn lựa chọn không hợp lệ: ${params.selectionSource}`,
      );
    }
  }

  private async verifyBidSource(params: VerifyProposalSourceParams): Promise<void> {
    const { sourceBidId, serviceRequestId, workerUserId } = params;

    if (!sourceBidId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'sourceBidId is required when selectionSource is bid',
      );
    }

    // Dev/Test mock shortcut (CANNOT be enabled in production)
    if (this.isMockEnabled) {
      if (this.isProduction) {
        throw new Error('Mock verifier cannot be enabled in production');
      }
      this.logger.warn(
        `[DEV/TEST ONLY] Mock verifier accepted bid ${sourceBidId} for request ${serviceRequestId}`,
      );
      return;
    }

    // Real production/staging verification via Bidding Service internal contract
    const rawBiddingUrl =
      this.config.get('BIDDING_SERVICE_URL') || 'http://localhost:3003';
    const biddingServiceUrl = rawBiddingUrl.replace(/\/+$/, '');
    const internalSecret = this.config.internalServiceSecret;

    const url = `${biddingServiceUrl}/api/v1/internal/bids/${sourceBidId}/eligibility?requestId=${serviceRequestId}&workerId=${workerUserId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          [ORDER_CONSTANTS.HEADER_INTERNAL_SECRET]: internalSecret || '',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 200) {
        const body = (await response.json()) as {
          data?: { eligible: boolean; reason?: string };
          eligible?: boolean;
          reason?: string;
        };
        const result = body.data || body;

        if (!result.eligible) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
            result.reason ||
              'Báo giá không đủ điều kiện để tạo đề xuất đặt lịch',
          );
        }

        this.logger.log(
          `Bid ${sourceBidId} verified successfully via Bidding Service`,
        );
        return;
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
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
          errorBody.message ||
            'Báo giá không tồn tại hoặc không đủ điều kiện nhận việc',
        );
      }

      // 5xx from Bidding Service -> Fail closed
      this.logger.error(
        `Bidding Service returned ${response.status} when verifying bid ${sourceBidId}. Failing closed.`,
      );
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ORDER_ERROR_CODES.SERVICE_UNAVAILABLE,
        'Không thể kết nối tới Bidding Service để xác thực báo giá. Vui lòng thử lại sau.',
      );
    } catch (err: unknown) {
      if (err instanceof AppException) {
        throw err;
      }

      // Fail-closed on network errors, DNS failure, timeout
      this.logger.error(
        `Bidding Service verifier error (${(err as Error).message}). Failing closed.`,
      );
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ORDER_ERROR_CODES.SERVICE_UNAVAILABLE,
        'Dịch vụ Bidding tạm thời không phản hồi. Xác minh báo giá thất bại (fail-closed).',
      );
    }
  }

  private async verifyRecommendationSource(
    params: VerifyProposalSourceParams,
  ): Promise<void> {
    const { sourceMatchResultId, serviceRequestId } = params;

    if (!sourceMatchResultId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
        'sourceMatchResultId is required when selectionSource is recommendation',
      );
    }

    // Dev/Test mock shortcut (CANNOT be enabled in production)
    if (this.isMockEnabled) {
      if (this.isProduction) {
        throw new Error('Mock verifier cannot be enabled in production');
      }
      this.logger.warn(
        `[DEV/TEST ONLY] Mock verifier accepted recommendation ${sourceMatchResultId} for request ${serviceRequestId}`,
      );
      return;
    }

    // Real production run: Matching service currently lacks an internal verification contract -> Strictly fail-closed!
    this.logger.warn(
      `Recommendation ${sourceMatchResultId} rejected: Matching Service contract not yet available. Failing closed.`,
    );
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
      'Nguồn gợi ý (recommendation) từ Matching Service chưa có hợp đồng xác thực trên môi trường thật. Thao tác bị từ chối an toàn (fail-closed).',
    );
  }
}
