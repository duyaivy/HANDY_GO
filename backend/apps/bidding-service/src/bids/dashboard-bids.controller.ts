import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '@app/auth';
import { buildSuccessResponse } from '@app/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';

@Public()
@UseGuards(TrustedGatewayGuard)
@Controller('internal/admin/dashboard')
export class DashboardBidsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('workers-with-bids')
  async workersWithBids(
    @Query('start') startInput: string,
    @Query('endExclusive') endInput: string,
  ) {
    const start = new Date(startInput);
    const end = new Date(endInput);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start > end
    ) {
      throw new BadRequestException('Invalid dashboard period');
    }
    const rows = await this.prisma.$queryRaw<{ workerId: string }[]>`
      SELECT DISTINCT worker_id AS "workerId"
      FROM (
        SELECT worker_id FROM bidding_service.bids
        WHERE submitted_at >= ${start} AND submitted_at < ${end}
        UNION
        SELECT b.worker_id FROM bidding_service.bid_revisions r
        JOIN bidding_service.bids b ON b.id = r.bid_id
        WHERE r.revised_at >= ${start} AND r.revised_at < ${end}
      ) activity
    `;
    return buildSuccessResponse(rows.map((row) => row.workerId));
  }
}
