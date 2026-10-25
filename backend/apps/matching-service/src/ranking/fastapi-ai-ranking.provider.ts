import { Injectable, Logger } from '@nestjs/common';
import type { IRankingProvider } from './ranking-provider.interface.js';
import type { RankingRequestDto, RankingResponseDto } from './ranking.dto.js';

@Injectable()
export class FastApiAiRankingProvider implements IRankingProvider {
  private readonly logger = new Logger(FastApiAiRankingProvider.name);

  readonly providerType = 'real_ai' as const;
  readonly modelVersion = 'intfloat/multilingual-e5-small-hybrid-v1.0';

  private readonly aiServiceUrl: string;
  private readonly timeoutMs: number;
  private readonly internalServiceSecret: string;

  constructor() {
    this.aiServiceUrl =
      process.env.AI_SERVICE_URL?.replace(/\/+$/, '') || 'http://localhost:8000';

    // Parse configured timeout. While backend env provides AI_SERVICE_TIMEOUT_MS=360000,
    // we allow an override or use a bounded HTTP client timeout for inference.
    const rawTimeout = process.env.AI_SERVICE_TIMEOUT_MS
      ? parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10)
      : 360000;
    this.timeoutMs = !isNaN(rawTimeout) && rawTimeout > 0 ? rawTimeout : 360000;

    this.internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET || '';
  }

  async rank(request: RankingRequestDto): Promise<RankingResponseDto> {
    const { serviceRequestId, requestRevision, candidates } = request;
    const endpoint = `${this.aiServiceUrl}/internal/ai/matching/rank`;

    this.logger.log(
      `Calling FastAPI AI Ranking Service at ${endpoint} for request ${serviceRequestId} (rev ${requestRevision}, ${candidates.length} candidates, timeout ${this.timeoutMs}ms)`,
    );

    // Single transient retry policy for 5xx or network glitches
    const maxAttempts = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': this.internalServiceSecret,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          const result = (await response.json()) as RankingResponseDto;

          this.logger.log(
            `FastAPI AI Ranking successful for request ${serviceRequestId}: ${result.rankedWorkers.length} ranked workers returned (model: ${result.modelVersion})`,
          );
          return result;
        }

        // Non-200 HTTP response
        const status = response.status;
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          errorBody = response.statusText;
        }

        // Permanent failures (4xx) should not be retried
        if (status >= 400 && status < 500) {
          this.logger.error(
            `FastAPI AI Ranking rejected request (HTTP ${status}): ${errorBody}`,
          );
          throw new Error(
            `FastAPI AI client error (HTTP ${status}): ${errorBody}`,
          );
        }

        // 5xx server errors
        this.logger.warn(
          `FastAPI AI server error (HTTP ${status}, attempt ${attempt}/${maxAttempts}): ${errorBody}`,
        );
        lastError = new Error(
          `FastAPI AI server error (HTTP ${status}): ${errorBody}`,
        );
      } catch (err) {
        const error = err as Error;
        lastError = error;

        // If it's a 4xx error we threw above, rethrow immediately without retrying
        if (error.message.includes('FastAPI AI client error')) {
          throw error;
        }

        // Network error or timeout
        const isTimeout =
          error.name === 'TimeoutError' || error.name === 'AbortError';
        const errType = isTimeout ? 'Timeout' : 'Network/Connection error';

        this.logger.warn(
          `FastAPI AI request failed with ${errType} (attempt ${attempt}/${maxAttempts}): ${error.message}`,
        );

        if (attempt === maxAttempts) {
          break;
        }
        // Brief backoff before transient retry
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    throw (
      lastError ||
      new Error(`FastAPI AI Ranking failed after ${maxAttempts} attempts`)
    );
  }
}
