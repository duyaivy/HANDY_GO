import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import type { DashboardPeriod } from './dashboard-period.js';
import {
  buildOrderTrend,
  type DashboardGranularity,
  type OrderTrendRow,
} from './dashboard-trend.js';
import { buildOrderStatus } from './dashboard-status.js';
import {
  rankTopWorkers,
  topWorkerCandidates,
  type DashboardWorkerSummary,
} from './dashboard-workers.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async overview(period: DashboardPeriod) {
    const createdAt = { gte: period.start, lt: period.endExclusive };
    const [revenue, orderCount, acceptedWorkers, quotedWorkers, customers] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { status: 'completed', completedAt: createdAt },
          _sum: { agreedPrice: true },
        }),
        this.prisma.order.count({ where: { createdAt } }),
        this.prisma.order.groupBy({
          by: ['workerUserId'],
          where: { createdAt },
        }),
        this.internalGet<string[]>(
          'BIDDING_SERVICE_URL',
          'workers-with-bids',
          period,
        ),
        this.internalGet<number>(
          'AUTH_SERVICE_URL',
          'registered-customers',
          period,
        ),
      ]);

    const workerIds = new Set<string>([
      ...acceptedWorkers.map((row) => row.workerUserId),
      ...quotedWorkers,
    ]);
    const total = revenue._sum.agreedPrice?.toNumber() ?? 0;
    if (
      !Number.isFinite(total) ||
      !Number.isSafeInteger(Math.round(total * 100))
    ) {
      throw new ServiceUnavailableException(
        'Dashboard revenue exceeds numeric response range',
      );
    }

    return {
      revenue: { total, currency: 'VND' as const },
      orders: { total: orderCount },
      workers: { activeInPeriod: workerIds.size },
      customers: { totalCumulative: customers },
    };
  }

  async orderTrend(period: DashboardPeriod, granularity: DashboardGranularity) {
    const rows = await this.prisma.$queryRaw<OrderTrendRow[]>`
      SELECT
        date_trunc(${granularity}::text, created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
          AT TIME ZONE 'Asia/Ho_Chi_Minh' AS "bucketStart",
        COUNT(*) AS "orderCount"
      FROM order_service.orders
      WHERE created_at >= ${period.start}
        AND created_at < ${period.endExclusive}
      GROUP BY 1
      ORDER BY 1
    `;
    return buildOrderTrend(period, granularity, rows);
  }

  async orderStatus(period: DashboardPeriod) {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: period.start, lt: period.endExclusive } },
      _count: { id: true },
    });
    return buildOrderStatus(rows);
  }

  async topWorkers(period: DashboardPeriod) {
    const rows = await this.prisma.order.groupBy({
      by: ['workerUserId'],
      where: {
        status: 'completed',
        completedAt: { gte: period.start, lt: period.endExclusive },
      },
      _count: { id: true },
    });
    const candidates = topWorkerCandidates(rows);
    if (candidates.length === 0) return [];

    const ids = candidates.map((row) => row.workerUserId);
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100)
      batches.push(ids.slice(i, i + 100));
    const summaries: DashboardWorkerSummary[] = [];
    for (let i = 0; i < batches.length; i += 3) {
      const pages = await Promise.all(
        batches
          .slice(i, i + 3)
          .map((batch) => this.getWorkerSummaryBatch(batch)),
      );
      summaries.push(...pages.flat());
    }
    return rankTopWorkers(candidates, summaries);
  }

  private async getWorkerSummaryBatch(
    ids: string[],
  ): Promise<DashboardWorkerSummary[]> {
    const baseUrl = this.config.get('USER_TRUST_SERVICE_URL');
    const secret = this.config.internalServiceSecret;
    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException(
        'USER_TRUST_SERVICE_URL is not configured',
      );
    }
    try {
      const url = new URL(
        '/api/v1/internal/workers/dashboard-summaries',
        baseUrl,
      );
      url.searchParams.set('ids', ids.join(','));
      const response = await fetch(url, {
        headers: { [ORDER_CONSTANTS.HEADER_INTERNAL_SECRET]: secret },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
      const body = (await response.json()) as { data?: unknown };
      if (
        !Array.isArray(body.data) ||
        !body.data.every(
          (row): row is DashboardWorkerSummary =>
            typeof row === 'object' &&
            row !== null &&
            typeof row.workerUserId === 'string' &&
            typeof row.fullName === 'string' &&
            (row.avatarUrl === null || typeof row.avatarUrl === 'string') &&
            typeof row.averageRating === 'number' &&
            Number.isFinite(row.averageRating),
        )
      ) {
        throw new Error('Invalid worker summary response');
      }
      return body.data;
    } catch {
      throw new ServiceUnavailableException(
        'USER_TRUST_SERVICE_URL dashboard data unavailable',
      );
    }
  }

  private async internalGet<T>(
    envKey: 'BIDDING_SERVICE_URL' | 'AUTH_SERVICE_URL',
    resource: string,
    period: DashboardPeriod,
  ): Promise<T> {
    const baseUrl = this.config.get(envKey);
    const secret = this.config.internalServiceSecret;
    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException(`${envKey} is not configured`);
    }
    const url = new URL(
      `/api/v1/internal/admin/dashboard/${resource}`,
      baseUrl,
    );
    url.searchParams.set('start', period.start.toISOString());
    url.searchParams.set('endExclusive', period.endExclusive.toISOString());
    try {
      const response = await fetch(url, {
        headers: { [ORDER_CONSTANTS.HEADER_INTERNAL_SECRET]: secret },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
      const body = (await response.json()) as { data?: T };
      if (body.data === undefined)
        throw new Error('Upstream response has no data');
      if (
        resource === 'registered-customers' &&
        (!Number.isSafeInteger(body.data) || Number(body.data) < 0)
      ) {
        throw new Error('Invalid customer count');
      }
      if (
        resource === 'workers-with-bids' &&
        (!Array.isArray(body.data) ||
          !body.data.every((id) => typeof id === 'string'))
      ) {
        throw new Error('Invalid worker IDs');
      }
      return body.data;
    } catch {
      throw new ServiceUnavailableException(
        `${envKey} dashboard data unavailable`,
      );
    }
  }
}
