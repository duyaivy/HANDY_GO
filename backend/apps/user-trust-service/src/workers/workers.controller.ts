import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { InternalServiceGuard } from '../common/guards/internal-service.guard.js';
import { WorkerSummariesQueryDto } from './dto/worker-summaries-query.dto.js';
import { WorkersService } from './workers.service.js';

@Public()
@UseGuards(InternalServiceGuard)
@Controller('internal/workers')
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Get('batch-summary')
  async getSummaries(@Query() query: WorkerSummariesQueryDto) {
    return buildSuccessResponse(
      await this.workers.getSummaries(query.ids),
      'Worker summaries retrieved',
    );
  }
}
