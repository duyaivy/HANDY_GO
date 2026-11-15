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
}
