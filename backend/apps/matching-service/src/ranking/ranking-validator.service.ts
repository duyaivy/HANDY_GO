import { Injectable, Logger } from '@nestjs/common';
import type { RankingResponseDto } from './ranking.dto.js';

@Injectable()
export class RankingValidatorService {
  private readonly logger = new Logger(RankingValidatorService.name);

  /**
   * Validates ranking output from a ranking provider prior to persistence.
   * Throws an Error if any invariant is violated.
   */
  validateRankingOutput(
    response: RankingResponseDto,
    eligibleWorkerUserIds: Set<string>,
    maxLimit = 20,
  ): void {
    if (!response) {
      throw new Error('Ranking response is null or undefined');
    }

    if (!response.modelVersion || response.modelVersion.trim().length === 0) {
      throw new Error('Ranking response modelVersion is missing');
    }

    if (!['mock', 'fallback', 'real_ai'].includes(response.providerType)) {
      throw new Error(
        `Invalid ranking providerType: '${response.providerType}'`,
      );
    }

    const { rankedWorkers } = response;

    if (!Array.isArray(rankedWorkers)) {
      throw new Error('rankedWorkers must be an array');
    }

    if (rankedWorkers.length > maxLimit) {
      throw new Error(
        `Ranking response returned ${rankedWorkers.length} results, exceeding max limit of ${maxLimit}`,
      );
    }

    const seenWorkerIds = new Set<string>();
    const seenRanks = new Set<number>();

    for (let i = 0; i < rankedWorkers.length; i++) {
      const worker = rankedWorkers[i];

      // Check worker ID format
      if (!worker.workerUserId || typeof worker.workerUserId !== 'string') {
        throw new Error(
          `Ranked worker at index ${i} has invalid workerUserId: ${worker.workerUserId}`,
        );
      }

      // Invariant 1: Candidate must be in the eligible candidate set
      if (!eligibleWorkerUserIds.has(worker.workerUserId)) {
        throw new Error(
          `Ranking provider returned worker ${worker.workerUserId} who was not in the eligible candidate pool`,
        );
      }

      // Invariant 2: No duplicate workers
      if (seenWorkerIds.has(worker.workerUserId)) {
        throw new Error(
          `Duplicate worker ${worker.workerUserId} found in ranking results at index ${i}`,
        );
      }
      seenWorkerIds.add(worker.workerUserId);

      // Invariant 3: Valid sequential rank
      const expectedRank = i + 1;
      if (worker.rank !== expectedRank) {
        throw new Error(
          `Invalid rank sequence: worker ${worker.workerUserId} has rank ${worker.rank}, expected ${expectedRank}`,
        );
      }
      if (worker.rank < 1 || worker.rank > 20) {
        throw new Error(
          `Rank ${worker.rank} for worker ${worker.workerUserId} is outside allowable range [1, 20]`,
        );
      }
      seenRanks.add(worker.rank);

      // Invariant 4: Score must be a finite number in [0.00, 100.00]
      if (
        typeof worker.matchingScore !== 'number' ||
        !Number.isFinite(worker.matchingScore) ||
        worker.matchingScore < 0.0 ||
        worker.matchingScore > 100.0
      ) {
        throw new Error(
          `Worker ${worker.workerUserId} has invalid matchingScore: ${worker.matchingScore}. Must be finite in [0.00, 100.00]`,
        );
      }

      // Invariant 5: Validate score breakdown
      if (worker.scoreBreakdown) {
        const { semanticScore, geoScore, ratingScore, experienceScore, completionScore } =
          worker.scoreBreakdown;
        const scores = [semanticScore, geoScore, ratingScore, experienceScore, completionScore];
        for (const s of scores) {
          if (typeof s !== 'number' || !Number.isFinite(s) || s < 0.0 || s > 100.0) {
            throw new Error(
              `Worker ${worker.workerUserId} has invalid component score in scoreBreakdown: ${s}`,
            );
          }
        }
      }
    }
  }
}
