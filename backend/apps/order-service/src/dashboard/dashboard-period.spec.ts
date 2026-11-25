import { describe, expect, it } from 'vitest';
import { resolveDashboardPeriod } from './dashboard-period.js';

const NOW = new Date('2026-11-15T08:00:00.000Z'); // 15:00 in Vietnam

describe('dashboard period', () => {
  it('uses Vietnam calendar days and caps the current day at now', () => {
    expect(resolveDashboardPeriod({ period: 'today' }, NOW)).toEqual({
      start: new Date('2026-11-14T17:00:00.000Z'),
      endExclusive: NOW,
    });
    expect(resolveDashboardPeriod({ period: '7days' }, NOW).start).toEqual(
      new Date('2026-11-08T17:00:00.000Z'),
    );
    expect(resolveDashboardPeriod({}, NOW).start).toEqual(
      new Date('2026-10-16T17:00:00.000Z'),
    );
  });

  it('includes the custom end date and caps a current-day selection at now', () => {
    expect(
      resolveDashboardPeriod(
        { period: 'custom', startDate: '2026-11-01', endDate: '2026-11-15' },
        NOW,
      ),
    ).toEqual({
      start: new Date('2026-10-31T17:00:00.000Z'),
      endExclusive: NOW,
    });
  });

  it('allows an empty current day at exactly midnight', () => {
    const midnight = new Date('2026-11-14T17:00:00.000Z');
    expect(resolveDashboardPeriod({ period: 'today' }, midnight)).toEqual({
      start: midnight,
      endExclusive: midnight,
    });
  });

  it('rejects invalid dates, future-only periods and more than 365 days', () => {
    expect(() =>
      resolveDashboardPeriod(
        { period: 'custom', startDate: '2026-02-30', endDate: '2026-03-01' },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      resolveDashboardPeriod(
        { period: 'custom', startDate: '2026-11-16', endDate: '2026-11-17' },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      resolveDashboardPeriod(
        { period: 'custom', startDate: '2025-11-15', endDate: '2026-11-15' },
        NOW,
      ),
    ).toThrow();
    expect(() =>
      resolveDashboardPeriod({ startDate: '2026-11-01' }, NOW),
    ).toThrow();
  });
});
