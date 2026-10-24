import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@app/auth';
import { InternalServiceGuard } from '../guards/internal-service.guard.js';
import { MatchRunRepository } from '../persistence/match-run.repository.js';
import { ServiceRequestProjectionService } from '../projections/service-request-projection.service.js';
import { InternalRecommendationResponseDto } from './dto/internal-recommendation-response.dto.js';
import { InternalEligibilityResponseDto } from './dto/internal-eligibility-response.dto.js';

@ApiTags('Matching Service (Internal Service-to-Service)')
@Public()
@Controller('internal/matching')
@UseGuards(InternalServiceGuard)
@ApiHeader({
  name: 'x-internal-secret',
  description: 'Mã xác thực gọi nội bộ giữa các microservices',
  required: false,
})
export class InternalMatchingController {
  constructor(
    private readonly matchRunRepo: MatchRunRepository,
    private readonly projectionService: ServiceRequestProjectionService,
  ) {}

  /**
   * Internal endpoint for Gateway/BFF to retrieve up to Top 20 ranked candidates
   * for composition and deduplication against incoming Bids.
   */
  @Get('requests/:id/recommendations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Internal: Lấy danh sách Top 20 đề xuất cho Gateway/BFF kết hợp Bids',
    description:
      'Chỉ trả về các đề xuất của revision hoàn thành mới nhất. Thứ tự xếp hạng được bảo toàn.',
  })
  @ApiParam({ name: 'id', description: 'ID yêu cầu dịch vụ', type: String })
  @ApiResponse({
    status: 200,
    description: 'Danh sách Top 20 đề xuất',
    type: InternalRecommendationResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Yêu cầu quyền truy cập nội bộ (x-internal-secret)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy kết quả đề xuất' })
  async getInternalRecommendations(
    @Param('id') requestId: string,
  ): Promise<InternalRecommendationResponseDto> {
    const latestCompletedRun =
      await this.matchRunRepo.getLatestCompletedRun(requestId);

    if (!latestCompletedRun) {
      throw new NotFoundException(
        `Không tìm thấy kết quả matching hoàn thành cho yêu cầu ${requestId}`,
      );
    }

    return {
      requestId,
      requestRevision: latestCompletedRun.requestRevision,
      status: latestCompletedRun.status,
      candidateCount: latestCompletedRun.candidateCount,
      resultCount: latestCompletedRun.results.length,
      recommendations: latestCompletedRun.results.map((r) => ({
        matchResultId: r.id,
        workerUserId: r.workerUserId,
        rank: r.rank,
        matchingScore: Number(r.matchingScore),
        scoreBreakdown: r.scoreBreakdown ? (r.scoreBreakdown as any) : undefined,
      })),
      generatedAt: latestCompletedRun.completedAt
        ? latestCompletedRun.completedAt.toISOString()
        : latestCompletedRun.createdAt.toISOString(),
      modelVersion: latestCompletedRun.modelVersion || undefined,
    };
  }

  /**
   * Internal endpoint called by Order Service before creating booking proposals or orders
   * from an AI recommendation to verify eligibility.
   */
  @Get('results/:id/eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Internal: Kiểm tra tính hợp lệ của kết quả Matching trước khi tạo Booking Proposal/Order',
    description:
      'Xác thực kết quả đề xuất tồn tại, thuộc đúng yêu cầu và thợ, thuộc revision mới nhất, và yêu cầu còn hiệu lực.',
  })
  @ApiParam({ name: 'id', description: 'ID kết quả matching (match_results.id)', type: String })
  @ApiQuery({ name: 'serviceRequestId', required: false, description: 'ID yêu cầu dự kiến' })
  @ApiQuery({ name: 'workerUserId', required: false, description: 'ID tài khoản thợ dự kiến' })
  @ApiResponse({
    status: 200,
    description: 'Kết quả kiểm tra tính hợp lệ',
    type: InternalEligibilityResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Yêu cầu quyền truy cập nội bộ' })
  async checkResultEligibility(
    @Param('id') resultId: string,
    @Query('serviceRequestId') serviceRequestId?: string,
    @Query('workerUserId') workerUserId?: string,
  ): Promise<InternalEligibilityResponseDto> {
    const result = await this.matchRunRepo.getResultById(resultId);

    if (!result) {
      return {
        matchResultId: resultId,
        isEligible: false,
        reason: 'Kết quả đề xuất không tồn tại trong hệ thống',
      };
    }

    const matchRun = result.matchRun;

    // Check expected serviceRequestId
    if (serviceRequestId && matchRun.serviceRequestId !== serviceRequestId) {
      return {
        matchResultId: resultId,
        isEligible: false,
        reason: `Mismatched serviceRequestId: Kết quả thuộc yêu cầu ${matchRun.serviceRequestId}, nhưng nhận được ${serviceRequestId}`,
        workerUserId: result.workerUserId,
        serviceRequestId: matchRun.serviceRequestId,
        requestRevision: matchRun.requestRevision,
      };
    }

    // Check expected workerUserId
    if (workerUserId && result.workerUserId !== workerUserId) {
      return {
        matchResultId: resultId,
        isEligible: false,
        reason: `Mismatched workerUserId: Kết quả dành cho thợ ${result.workerUserId}, nhưng nhận được ${workerUserId}`,
        workerUserId: result.workerUserId,
        serviceRequestId: matchRun.serviceRequestId,
        requestRevision: matchRun.requestRevision,
      };
    }

    // Check if a newer revision has already completed (Stale result check)
    const latestCompletedRun = await this.matchRunRepo.getLatestCompletedRun(
      matchRun.serviceRequestId,
    );

    if (
      latestCompletedRun &&
      latestCompletedRun.requestRevision > matchRun.requestRevision
    ) {
      return {
        matchResultId: resultId,
        isEligible: false,
        reason: `Kết quả thuộc revision ${matchRun.requestRevision} đã bị thay thế bởi revision ${latestCompletedRun.requestRevision}`,
        workerUserId: result.workerUserId,
        serviceRequestId: matchRun.serviceRequestId,
        requestRevision: matchRun.requestRevision,
      };
    }

    // Check request status from projection
    const projection = await this.projectionService.getProjection(
      matchRun.serviceRequestId,
    );
    if (projection && ['cancelled', 'converted_to_order'].includes(projection.status)) {
      return {
        matchResultId: resultId,
        isEligible: false,
        reason: `Yêu cầu dịch vụ hiện không còn mở để chọn thợ (trạng thái: ${projection.status})`,
        workerUserId: result.workerUserId,
        serviceRequestId: matchRun.serviceRequestId,
        requestRevision: matchRun.requestRevision,
      };
    }

    return {
      matchResultId: resultId,
      isEligible: true,
      reason: 'Kết quả đề xuất hợp lệ và sẵn sàng để tạo Booking Proposal',
      workerUserId: result.workerUserId,
      serviceRequestId: matchRun.serviceRequestId,
      requestRevision: matchRun.requestRevision,
      matchingScore: Number(result.matchingScore),
    };
  }
}
