import { describe, expect, it } from 'vitest';
import {
  buildOrderTrend,
  selectDashboardGranularity,
} from './dashboard-trend.js';

describe('dashboard trend buckets', () => {
  it('selects hour, day, week and month from the agreed period thresholds', () => {
    expect(selectDashboardGranularity({ period: 'today' })).toBe('hour');
    expect(selectDashboardGranularity({ period: '7days' })).toBe('day');
    expect(selectDashboardGranularity({ period: '30days' })).toBe('day');
    expect(
      selectDashboardGranularity({
        period: 'custom',
        startDate: '2026-11-15',
        endDate: '2026-11-15',
      }),
    ).toBe('hour');
    expect(
      selectDashboardGranularity({
        period: 'custom',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      }),
    ).toBe('day');
    expect(
      selectDashboardGranularity({
        period: 'custom',
        startDate: '2026-11-01',
        endDate: '2026-12-10',
      }),
    ).toBe('week');
    expect(
      selectDashboardGranularity({
        period: 'custom',
        startDate: '2026-08-01',
        endDate: '2026-11-15',
      }),
    ).toBe('month');
  });

  it('fills missing Vietnam hours and excludes future hours', () => {
    const trend = buildOrderTrend(
      {
        start: new Date('2026-11-14T17:00:00Z'),
        endExclusive: new Date('2026-11-14T19:30:00Z'),
      },
      'hour',
      [
        { bucketStart: new Date('2026-11-14T17:00:00Z'), orderCount: 2n },
        { bucketStart: new Date('2026-11-14T19:00:00Z'), orderCount: 1n },
      ],
    );
    expect(trend.timeline).toEqual([
      { bucket: '2026-11-15T00:00+07:00', orderCount: 2 },
      { bucket: '2026-11-15T01:00+07:00', orderCount: 0 },
      { bucket: '2026-11-15T02:00+07:00', orderCount: 1 },
    ]);
    expect(trend.timeline.reduce((sum, item) => sum + item.orderCount, 0)).toBe(
      3,
    );
  });

  it('places orders around midnight in distinct local days', () => {
    const trend = buildOrderTrend(
      {
        start: new Date('2026-11-13T17:00:00Z'),
        endExclusive: new Date('2026-11-15T08:00:00Z'),
      },
      'day',
      [
        { bucketStart: new Date('2026-11-13T17:00:00Z'), orderCount: 1n },
        { bucketStart: new Date('2026-11-14T17:00:00Z'), orderCount: 2n },
      ],
    );
    expect(trend.timeline).toEqual([
      { bucket: '2026-11-14', orderCount: 1 },
      { bucket: '2026-11-15', orderCount: 2 },
    ]);
  });

  it('labels partial weeks by Monday and partial months by the month', () => {
    const period = {
      start: new Date('2026-10-31T17:00:00Z'), // Sunday, November 1 in Vietnam
      endExclusive: new Date('2026-11-16T17:00:00Z'),
    };
    const weeks = buildOrderTrend(period, 'week', []);
    expect(weeks.timeline.map((point) => point.bucket)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ]);
    const months = buildOrderTrend(period, 'month', []);
    expect(months.timeline).toEqual([{ bucket: '2026-11', orderCount: 0 }]);
  });

  it('keeps the full zero-filled day range and crosses month boundaries', () => {
    const days = buildOrderTrend(
      {
        start: new Date('2026-11-28T17:00:00Z'),
        endExclusive: new Date('2026-12-02T17:00:00Z'),
      },
      'day',
      [],
    );
    expect(days.timeline.map((point) => point.bucket)).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
    expect(days.timeline.every((point) => point.orderCount === 0)).toBe(true);

    const months = buildOrderTrend(
      {
        start: new Date('2026-11-28T17:00:00Z'),
        endExclusive: new Date('2026-12-02T17:00:00Z'),
      },
      'month',
      [],
    );
    expect(months.timeline.map((point) => point.bucket)).toEqual([
      '2026-11',
      '2026-12',
    ]);
  });

  it('returns a zero current bucket when the selected period has no orders', () => {
    const midnight = new Date('2026-11-14T17:00:00Z');
    expect(
      buildOrderTrend({ start: midnight, endExclusive: midnight }, 'hour', [])
        .timeline,
    ).toEqual([{ bucket: '2026-11-15T00:00+07:00', orderCount: 0 }]);
  });
});
