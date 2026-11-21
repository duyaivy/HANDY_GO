import { BadRequestException } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardPeriodQueryDto {
  @ApiPropertyOptional({
    enum: ['today', '7days', '30days', 'custom'],
    default: '30days',
  })
  @IsOptional()
  @IsIn(['today', '7days', '30days', 'custom'])
  period?: 'today' | '7days' | '30days' | 'custom';

  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Required when period=custom',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-11-15',
    description: 'Required when period=custom',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export interface DashboardPeriod {
  start: Date;
  endExclusive: Date;
}

function vietnamDayStart(value: string): number {
  if (!DATE_PATTERN.test(value)) {
    throw new BadRequestException('Date must use YYYY-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  if (new Date(utc).toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Invalid calendar date');
  }
  return utc - VIETNAM_OFFSET_MS;
}

export function resolveDashboardPeriod(
  query: DashboardPeriodQueryDto,
  now = new Date(),
): DashboardPeriod {
  const period = query.period ?? '30days';
  const today = new Date(now.getTime() + VIETNAM_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  const todayStart = vietnamDayStart(today);
  let start: number;
  let endExclusive: number;

  if (period === 'custom') {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException(
        'Custom period requires startDate and endDate',
      );
    }
    start = vietnamDayStart(query.startDate);
    endExclusive = vietnamDayStart(query.endDate) + DAY_MS;
    const days = (endExclusive - start) / DAY_MS;
    if (days < 1 || days > 365) {
      throw new BadRequestException('Custom period must contain 1 to 365 days');
    }
  } else {
    if (query.startDate !== undefined || query.endDate !== undefined) {
      throw new BadRequestException('Dates require period=custom');
    }
    const days = period === 'today' ? 1 : period === '7days' ? 7 : 30;
    start = todayStart - (days - 1) * DAY_MS;
    endExclusive = todayStart + DAY_MS;
  }

  endExclusive = Math.min(endExclusive, now.getTime());
  if (start > endExclusive) {
    throw new BadRequestException('Period must start before the current time');
  }
  return { start: new Date(start), endExclusive: new Date(endExclusive) };
}
