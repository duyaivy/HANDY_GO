import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { buildSuccessResponse } from '@app/common';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import {
  DashboardPeriodQueryDto,
  resolveDashboardPeriod,
} from './dashboard-period.js';
import { DashboardService } from './dashboard.service.js';
import { selectDashboardGranularity } from './dashboard-trend.js';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(TrustedGatewayGuard, AdminGuard)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Admin dashboard overview (HG-74)' })
  @ApiOkResponse({
    description: 'Four overview metrics using the selected Vietnam-time period',
    schema: {
      example: {
        statusCode: 200,
        message: 'Thao tác thành công',
        data: {
          revenue: { total: 125400000, currency: 'VND' },
          orders: { total: 1284 },
          workers: { activeInPeriod: 328 },
          customers: { totalCumulative: 2450 },
        },
      },
    },
  })
  async overview(@Query() query: DashboardPeriodQueryDto) {
    const period = resolveDashboardPeriod(query);
    return buildSuccessResponse(await this.dashboard.overview(period));
  }

  @Get('order-trend')
  @ApiOperation({
    summary: 'Created order trend for the selected Vietnam-time period (HG-74)',
    description:
      'Buckets use Asia/Ho_Chi_Minh: hour YYYY-MM-DDTHH:00+07:00, day YYYY-MM-DD, week Monday YYYY-MM-DD, month YYYY-MM. Today uses hours; 7/30 days use days; custom uses hours (1 day), days (2-31), weeks (32-90), or months (91-365). Missing buckets have count 0; future buckets are omitted.',
  })
  @ApiOkResponse({
    description: 'Chronological buckets; missing buckets have orderCount 0',
    schema: {
      example: {
        statusCode: 200,
        message: 'Thao tác thành công',
        data: {
          granularity: 'day',
          timeline: [
            { bucket: '2026-11-14', orderCount: 4 },
            { bucket: '2026-11-15', orderCount: 0 },
          ],
        },
      },
    },
  })
  async orderTrend(@Query() query: DashboardPeriodQueryDto) {
    const period = resolveDashboardPeriod(query);
    const granularity = selectDashboardGranularity(query);
    return buildSuccessResponse(
      await this.dashboard.orderTrend(period, granularity),
    );
  }

  @Get('order-status')
  @ApiOperation({
    summary: 'Current order status and completion/cancellation rates (HG-74)',
    description:
      'Counts orders created in the selected Vietnam-time period by their current status. Each order belongs to exactly one of completed, processing, cancelled, or disputed. Rates use totalOrders as denominator and are rounded to one decimal place.',
  })
  @ApiOkResponse({
    description: 'Four status groups and order performance percentages',
    schema: {
      example: {
        statusCode: 200,
        message: 'Thao tác thành công',
        data: {
          totalOrders: 100,
          groups: {
            completed: { count: 60, percentage: 60 },
            processing: { count: 20, percentage: 20 },
            cancelled: { count: 10, percentage: 10 },
            disputed: { count: 10, percentage: 10 },
          },
          performance: { completionRate: 60, cancellationRate: 10 },
        },
      },
    },
  })
  async orderStatus(@Query() query: DashboardPeriodQueryDto) {
    const period = resolveDashboardPeriod(query);
    return buildSuccessResponse(await this.dashboard.orderStatus(period));
  }

  @Get('top-workers')
  @ApiOperation({
    summary:
      'Top five workers by orders completed in the selected period (HG-74)',
    description:
      'Counts completed orders by completedAt in Asia/Ho_Chi_Minh. Ties use the current WorkerProfile.averageRating, then workerUserId. Missing worker profiles retain their order count with a placeholder name and null rating.',
  })
  @ApiOkResponse({
    description: 'Up to five ranked workers, or an empty array',
    schema: {
      example: {
        statusCode: 200,
        message: 'Thao tác thành công',
        data: [
          {
            workerUserId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            fullName: 'Nguyễn Văn An',
            avatarUrl: null,
            completedOrderCount: 58,
            averageRating: 4.9,
          },
        ],
      },
    },
  })
  async topWorkers(@Query() query: DashboardPeriodQueryDto) {
    const period = resolveDashboardPeriod(query);
    return buildSuccessResponse(await this.dashboard.topWorkers(period));
  }

  @Get('top-services')
  @ApiOperation({
    summary:
      'Top five services by orders completed in the selected period (HG-74)',
    description:
      'Counts completed orders by completedAt in Asia/Ho_Chi_Minh. Ties use serviceId as a stable secondary key. Inactive services remain eligible; missing catalog records keep their order count with a placeholder name.',
  })
  @ApiOkResponse({
    description: 'Up to five ranked services, or an empty array',
    schema: {
      example: {
        statusCode: 200,
        message: 'Thao tác thành công',
        data: [
          {
            serviceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            name: 'Vệ sinh nhà cửa',
            iconUrl: null,
            completedOrderCount: 58,
          },
        ],
      },
    },
  })
  async topServices(@Query() query: DashboardPeriodQueryDto) {
    const period = resolveDashboardPeriod(query);
    return buildSuccessResponse(await this.dashboard.topServices(period));
  }
}
