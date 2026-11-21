import type {
  DashboardPeriod,
  DashboardPeriodQueryDto,
} from './dashboard-period.js';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export type DashboardGranularity = 'hour' | 'day' | 'week' | 'month';

export interface OrderTrendRow {
  bucketStart: Date;
  orderCount: bigint;
}

export function selectDashboardGranularity(
  query: DashboardPeriodQueryDto,
): DashboardGranularity {
  const period = query.period ?? '30days';
  if (period === 'today') return 'hour';
  if (period !== 'custom') return 'day';

  // resolveDashboardPeriod validates both dates before this function is called.
  const days =
    (Date.parse(`${query.endDate}T00:00:00Z`) -
      Date.parse(`${query.startDate}T00:00:00Z`)) /
      DAY_MS +
    1;
  if (days === 1) return 'hour';
  if (days <= 31) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

function toVietnamLocal(instant: Date): Date {
  return new Date(instant.getTime() + VIETNAM_OFFSET_MS);
}

function fromVietnamLocal(local: Date): Date {
  return new Date(local.getTime() - VIETNAM_OFFSET_MS);
}

function floorBucket(instant: Date, granularity: DashboardGranularity): Date {
  const local = toVietnamLocal(instant);
  local.setUTCMinutes(0, 0, 0);
  if (granularity !== 'hour') local.setUTCHours(0);
  if (granularity === 'week') {
    const daysSinceMonday = (local.getUTCDay() + 6) % 7;
    local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  }
  if (granularity === 'month') local.setUTCDate(1);
  return fromVietnamLocal(local);
}

function nextBucket(instant: Date, granularity: DashboardGranularity): Date {
  const local = toVietnamLocal(instant);
  if (granularity === 'hour') local.setUTCHours(local.getUTCHours() + 1);
  if (granularity === 'day') local.setUTCDate(local.getUTCDate() + 1);
  if (granularity === 'week') local.setUTCDate(local.getUTCDate() + 7);
  if (granularity === 'month') local.setUTCMonth(local.getUTCMonth() + 1);
  return fromVietnamLocal(local);
}

function formatBucket(
  instant: Date,
  granularity: DashboardGranularity,
): string {
  const local = toVietnamLocal(instant).toISOString();
  if (granularity === 'hour') return `${local.slice(0, 13)}:00+07:00`;
  if (granularity === 'month') return local.slice(0, 7);
  return local.slice(0, 10);
}

export function buildOrderTrend(
  period: DashboardPeriod,
  granularity: DashboardGranularity,
  rows: OrderTrendRow[],
) {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const count = Number(row.orderCount);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Order trend count exceeds numeric response range');
    }
    counts.set(row.bucketStart.getTime(), count);
  }

  const timeline: { bucket: string; orderCount: number }[] = [];
  let cursor = floorBucket(period.start, granularity);
  do {
    timeline.push({
      bucket: formatBucket(cursor, granularity),
      orderCount: counts.get(cursor.getTime()) ?? 0,
    });
    cursor = nextBucket(cursor, granularity);
  } while (cursor < period.endExclusive);

  return { granularity, timeline };
}
