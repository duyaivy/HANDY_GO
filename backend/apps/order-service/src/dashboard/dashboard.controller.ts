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
}
