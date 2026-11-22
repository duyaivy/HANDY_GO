import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { DashboardServiceSummariesQueryDto } from './dto/dashboard-service-summaries-query.dto.js';
import { InternalServiceGuard } from './internal-service.guard.js';
import { ServicesService } from './services.service.js';

@Public()
@UseGuards(InternalServiceGuard)
@Controller('internal/services')
export class DashboardServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get('dashboard-summaries')
  async getDashboardSummaries(
    @Query() query: DashboardServiceSummariesQueryDto,
  ) {
    return buildSuccessResponse(
      await this.services.getDashboardSummaries(query.ids),
      'Dashboard service summaries retrieved',
    );
  }
}
