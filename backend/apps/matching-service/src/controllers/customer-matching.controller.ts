import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  type AuthenticatedUser,
} from '@app/auth';
import { MatchRunRepository } from '../persistence/match-run.repository.js';
import { ServiceRequestProjectionService } from '../projections/service-request-projection.service.js';
import {
  CANDIDATE_PROVIDER,
  type ICandidateProvider,
} from '../candidates/candidate.provider.interface.js';
import { Inject } from '@nestjs/common';
import { buildSuccessResponse, type ApiResponseEnvelope } from '@app/common';
import {
  CustomerRecommendationResponseDto,
  CustomerRecommendationResponseDtoEnvelope,
} from './dto/customer-recommendation-response.dto.js';
import {
  WorkerRequestDiscoveryResponseDto,
  WorkerRequestDiscoveryResponseDtoEnvelope,
} from './dto/worker-request-discovery-response.dto.js';

@ApiTags('Matching Service (Customer & Worker)')
@Controller('matching')
export class CustomerMatchingController {
  constructor(
    private readonly matchRunRepo: MatchRunRepository,
    private readonly projectionService: ServiceRequestProjectionService,
    @Inject(CANDIDATE_PROVIDER)
    private readonly candidateProvider: ICandidateProvider,
  ) {}

  /**
   * Retrieves recommended Workers (Top 5) for a Service Request.
   */
  @UseGuards(JwtAuthGuard)
  @Get('requests/:id/recommendations')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách Top 5 thợ đề xuất cho yêu cầu dịch vụ (Customer)',
    description:
      'Quy trình matching diễn ra bất đồng bộ thông qua RabbitMQ. Matching Service lưu trữ Top 20 ứng viên ' +
      'được xếp hạng bởi FastAPI AI Service độc lập (mô hình Multilingual E5 Small & Hybrid Ranking). ' +
      'Endpoint này trả về tối đa Top 5 thợ tối ưu nhất cho khách hàng từ revision hợp lệ mới nhất. ' +
      'Metadata mô hình cho biết providerType là real_ai hoặc fallback.',
  })
  @ApiParam({ name: 'id', description: 'ID yêu cầu dịch vụ', type: String })
  @ApiResponse({
    status: 200,
    description: 'Lấy đề xuất thành công',
    type: CustomerRecommendationResponseDtoEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không đủ quyền xem đề xuất của yêu cầu này' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy yêu cầu dịch vụ' })
  async getRecommendations(
    @Param('id') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponseEnvelope<CustomerRecommendationResponseDto>> {
    const projection = await this.projectionService.getProjection(requestId);

    // If projection exists, verify ownership (Customer or Admin)
    if (projection) {
      const isOwner = projection.customerUserId === user.userId;
      const isAdmin = user.roles?.includes('Admin');
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập kết quả đề xuất của yêu cầu dịch vụ này',
        );
      }

      // If request was cancelled or converted, do not expose active recommendations
      if (['cancelled', 'converted_to_order'].includes(projection.status)) {
        return buildSuccessResponse(
          {
            requestId,
            requestRevision: projection.matchingRevision,
            status: projection.status,
            displayLimit: 5,
            recommendations: [],
            generatedAt: new Date().toISOString(),
          },
          'Lấy danh sách đề xuất thành công',
        );
      }
    }

    const latestCompletedRun =
      await this.matchRunRepo.getLatestCompletedRun(requestId);

    if (!latestCompletedRun) {
      // Check if there is an in-progress or pending run
      const latestRun = await this.matchRunRepo.getLatestRun(requestId);
      if (latestRun) {
        return buildSuccessResponse(
          {
            requestId,
            requestRevision: latestRun.requestRevision,
            status: latestRun.status,
            displayLimit: latestRun.displayLimit,
            recommendations: [],
            generatedAt: latestRun.createdAt.toISOString(),
            modelVersion: latestRun.modelVersion || undefined,
          },
          'Lấy danh sách đề xuất thành công',
        );
      }

      // No run found
      return buildSuccessResponse(
        {
          requestId,
          requestRevision: projection?.matchingRevision || 1,
          status: 'pending',
          displayLimit: 5,
          recommendations: [],
        },
        'Lấy danh sách đề xuất thành công',
      );
    }

    // Restrict to Top 5 for customer display
    const top5Results = latestCompletedRun.results.slice(
      0,
      latestCompletedRun.displayLimit || 5,
    );

    return buildSuccessResponse(
      {
        requestId,
        requestRevision: latestCompletedRun.requestRevision,
        status: latestCompletedRun.status,
        displayLimit: latestCompletedRun.displayLimit,
        recommendations: top5Results.map((r) => ({
          matchResultId: r.id,
          workerUserId: r.workerUserId,
          rank: r.rank,
          matchingScore: Number(r.matchingScore),
        })),
        generatedAt: latestCompletedRun.completedAt
          ? latestCompletedRun.completedAt.toISOString()
          : latestCompletedRun.createdAt.toISOString(),
        modelVersion: latestCompletedRun.modelVersion || undefined,
      },
      'Lấy danh sách đề xuất thành công',
    );
  }

  /**
   * Worker discovers suitable open Service Requests in their trade and service areas.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/requests')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thợ tìm kiếm các yêu cầu dịch vụ phù hợp trong khu vực hoạt động',
    description:
      'Lọc theo dịch vụ thợ đăng ký, bán kính hoạt động (Haversine), và trạng thái mở.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Danh sách yêu cầu phù hợp',
    type: WorkerRequestDiscoveryResponseDtoEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Chỉ dành cho tài khoản Thợ đã xác minh' })
  async getDiscoverableRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ): Promise<ApiResponseEnvelope<WorkerRequestDiscoveryResponseDto>> {
    const page = Math.max(1, parseInt(pageStr || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(limitStr || '10', 10)));

    // Retrieve worker's active profile and areas from candidate provider
    const profile = await this.candidateProvider.getWorkerMatchProfile(
      user.userId,
    );

    if (!profile) {
      throw new ForbiddenException(
        'Không tìm thấy hồ sơ thợ hoặc tài khoản chưa kích hoạt',
      );
    }

    if (!profile.isVerified) {
      throw new ForbiddenException(
        'Hồ sơ thợ chưa được xác thực KYC để nhận yêu cầu dịch vụ',
      );
    }

    const result = await this.projectionService.findMatchingRequestsForWorker({
      workerUserId: user.userId,
      serviceIds: profile.serviceIds,
      serviceAreas: profile.serviceAreas,
      page,
      limit,
    });

    return buildSuccessResponse(
      {
        items: result.items.map((item) => ({
          id: item.id,
          requestCode: item.requestCode,
          serviceId: item.serviceId,
          description: item.description || '',
          distanceKm: item.distanceKm,
          scheduledAt: item.scheduledAt ? item.scheduledAt.toISOString() : undefined,
          addressText: item.addressText || undefined,
          createdAt: item.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
      'Lấy danh sách yêu cầu phù hợp thành công',
    );
  }
}

