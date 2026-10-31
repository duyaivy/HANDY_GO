import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@app/config';
import type { WorkerProfileSummaryDto } from '../dto/candidates-response.dto.js';

@Injectable()
export class WorkerProfilesClient {
  private readonly logger = new Logger(WorkerProfilesClient.name);
  constructor(private readonly config: ConfigService) {}

  async getSummaries(
    ids: string[],
  ): Promise<Map<string, WorkerProfileSummaryDto>> {
    const profiles = new Map<string, WorkerProfileSummaryDto>();
    if (!ids.length) return profiles;
    try {
      const raw = this.config
        .getUrl('USER_TRUST_SERVICE_URL')
        .replace(/\/+$/, '');
      const base = raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
      const url = new URL(`${base}/internal/workers/batch-summary`);
      url.searchParams.set('ids', [...new Set(ids)].join(','));
      const response = await fetch(url, {
        headers: { 'x-internal-secret': this.config.internalServiceSecret },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error('Upstream unavailable');
      const body = (await response.json()) as { data?: unknown };
      if (!Array.isArray(body.data))
        throw new Error('Invalid summary response');
      for (const row of body.data) {
        if (
          !ids.includes(row.workerId) ||
          typeof row.fullName !== 'string' ||
          !row.fullName.trim()
        )
          continue;
        profiles.set(row.workerId, {
          fullName: row.fullName,
          avatarUrl: row.avatarUrl ?? null,
          averageRating: row.averageRating ?? null,
          ratingCount: row.ratingCount ?? 0,
          completedOrderCount: row.completedOrderCount ?? 0,
        });
      }
    } catch {
      this.logger.warn({ event: 'worker_profiles_unavailable' });
    }
    return profiles;
  }
}
