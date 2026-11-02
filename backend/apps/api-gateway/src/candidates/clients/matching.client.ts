import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@app/config';
import crypto from 'node:crypto';

export interface MatchingRankedCandidate {
  matchResultId: string;
  workerUserId: string;
  rank: number;
  matchingScore: number;
  scoreBreakdown?: Record<string, any>;
}

export interface MatchingClientResult {
  status: string;
  recommendations: MatchingRankedCandidate[];
  modelVersion?: string;
  generatedAt?: string;
  error?: string;
  statusCode?: number;
}

@Injectable()
export class MatchingClient {
  private readonly logger = new Logger(MatchingClient.name);

  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    const raw = this.config.getUrl('MATCHING_SERVICE_URL').replace(/\/+$/, '');
    return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
  }

  async getRecommendations(
    requestId: string,
    correlationId?: string,
  ): Promise<MatchingClientResult> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/internal/matching/requests/${requestId}/recommendations`;
    const reqId = correlationId || crypto.randomUUID();
    const timeoutMs = this.config.upstreamTimeoutMs || 3000;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': this.config.internalServiceSecret,
          'x-request-id': reqId,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 200) {
        const body = (await response.json()) as { data?: any };
        const data = body.data || body;

        return {
          status: data.status || 'completed',
          recommendations: Array.isArray(data.recommendations)
            ? data.recommendations
            : [],
          modelVersion: data.modelVersion || undefined,
          generatedAt: data.generatedAt || undefined,
        };
      }

      // 404 indicates no completed run yet (matching is still in progress / pending)
      // This is an expected asynchronous lifecycle state, not an infrastructure failure.
      if (response.status === 404) {
        return {
          status: 'processing',
          recommendations: [],
        };
      }

      this.logger.warn(
        `Matching service returned HTTP ${response.status} for request ${requestId}`,
      );
      return {
        status: 'unavailable',
        recommendations: [],
        statusCode: response.status,
        error: `Matching service returned status ${response.status}`,
      };
    } catch (err: any) {
      const isTimeout =
        err.name === 'TimeoutError' ||
        err.message?.includes('timeout') ||
        err.message?.includes('ETIMEDOUT');

      this.logger.warn(
        `Failed to call Matching Service for request ${requestId}: ${err.message}`,
      );

      return {
        status: 'unavailable',
        recommendations: [],
        error: isTimeout
          ? 'Matching service request timed out'
          : `Matching service unavailable: ${err.message}`,
      };
    }
  }
}
