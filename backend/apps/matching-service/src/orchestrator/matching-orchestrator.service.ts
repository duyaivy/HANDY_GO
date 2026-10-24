import { Inject, Injectable, Logger } from '@nestjs/common';
import { MatchRunRepository } from '../persistence/match-run.repository.js';
import {
  CANDIDATE_PROVIDER,
  type ICandidateProvider,
} from '../candidates/candidate.provider.interface.js';
import { EligibilityService } from '../eligibility/eligibility.service.js';
import { FeatureBuilderService } from '../features/feature-builder.service.js';
import {
  RANKING_PROVIDER,
  type IRankingProvider,
} from '../ranking/ranking-provider.interface.js';
import { RuleBasedFallbackRanker } from '../ranking/rule-based-fallback.ranker.js';
import { RankingValidatorService } from '../ranking/ranking-validator.service.js';
import { MatchingOutboxPublisherService } from '../outbox/matching-outbox-publisher.service.js';
import type { MatchingJobPayload } from '../queue/matching-job.types.js';
import type {
  RankingCandidateInput,
  RankingResponseDto,
} from '../ranking/ranking.dto.js';

@Injectable()
export class MatchingOrchestratorService {
  private readonly logger = new Logger(MatchingOrchestratorService.name);

  constructor(
    private readonly matchRunRepo: MatchRunRepository,
    @Inject(CANDIDATE_PROVIDER)
    private readonly candidateProvider: ICandidateProvider,
    private readonly eligibilityService: EligibilityService,
    private readonly featureBuilder: FeatureBuilderService,
    @Inject(RANKING_PROVIDER)
    private readonly primaryRanker: IRankingProvider,
    private readonly fallbackRanker: RuleBasedFallbackRanker,
    private readonly rankingValidator: RankingValidatorService,
    private readonly outboxPublisher: MatchingOutboxPublisherService,
  ) {}

  /**
   * Orchestrates the complete matching workflow for a service request revision.
   */
  async processMatchingJob(job: MatchingJobPayload): Promise<void> {
    const startTime = Date.now();
    const {
      serviceRequestId,
      serviceId,
      requestRevision,
      runNumber,
      customerUserId,
      description,
      latitude,
      longitude,
      simulationOptions,
    } = job;

    this.logger.log(
      `Starting matching orchestration for request ${serviceRequestId} (revision ${requestRevision}, run ${runNumber})`,
    );

    // 1. Locate or create MatchRun record and transition to 'processing'
    const matchRun = await this.matchRunRepo.createOrGetRun({
      serviceRequestId,
      serviceId,
      requestRevision,
      runNumber,
      displayLimit: 5,
    });

    await this.matchRunRepo.updateRunStatus(matchRun.id, 'processing');

    try {
      // 2. Discover potential worker candidates from upstream service
      const rawCandidates = await this.candidateProvider.findCandidates({
        serviceId,
        latitude,
        longitude,
        customerUserId,
      });

      this.logger.debug(
        `Retrieved ${rawCandidates.length} candidate workers from upstream provider`,
      );

      // 3. Apply Hard Eligibility Rules (Binary Gates)
      const eligibleCandidates: RankingCandidateInput[] = [];
      const eligibleWorkerIds = new Set<string>();

      for (const candidate of rawCandidates) {
        const eligibilityResult = this.eligibilityService.evaluateCandidate(
          {
            workerUserId: candidate.workerUserId,
            workerProfileId: candidate.workerProfileId,
            userStatus: candidate.userStatus || 'active',
            workerProfileStatus: candidate.workerProfileStatus || 'verified',
            hasApprovedKyc: candidate.hasApprovedKyc ?? true,
            hasActiveMatchingOffering: true,
            serviceAreas: [
              {
                latitude: candidate.centerLatitude,
                longitude: candidate.centerLongitude,
                radiusKm: candidate.radiusKm,
                isActive: true,
              },
            ],
          },
          {
            serviceRequestId,
            serviceId,
            customerUserId,
            latitude,
            longitude,
          },
        );

        if (eligibilityResult.isEligible) {
          eligibleCandidates.push({
            workerUserId: candidate.workerUserId,
            offeringTitle: candidate.offeringTitle,
            offeringDescription: candidate.offeringDescription,
            distanceKm: eligibilityResult.minimumDistanceKm ?? candidate.distanceKm,
            radiusKm: candidate.radiusKm,
            averageRating: candidate.averageRating,
            ratingCount: candidate.ratingCount,
            experienceYears: candidate.experienceYears,
            historicalCompletionRate: undefined, // platform cold-start default
          });
          eligibleWorkerIds.add(candidate.workerUserId);
        } else {
          this.logger.debug(
            `Worker ${candidate.workerUserId} rejected by eligibility: ${eligibilityResult.reasons.join('; ')}`,
          );
        }
      }

      this.logger.log(
        `Eligibility filtering complete: ${eligibleCandidates.length}/${rawCandidates.length} workers eligible`,
      );

      // 4. Handle Zero Eligible Candidates Scenario
      if (eligibleCandidates.length === 0) {
        this.logger.log(
          `Zero eligible workers found for request ${serviceRequestId}. Completing run with 0 results.`,
        );

        const durationMs = Date.now() - startTime;
        await this.matchRunRepo.persistMatchResults({
          matchRunId: matchRun.id,
          serviceRequestId,
          requestRevision,
          candidateCount: 0,
          results: [],
          modelVersion: this.primaryRanker.modelVersion,
          outboxPayload: {
            eventId: crypto.randomUUID(),
            eventType: 'matching.completed',
            requestId: serviceRequestId,
            requestRevision,
            matchRunId: matchRun.id,
            candidateCount: 0,
            resultCount: 0,
            rankingProvider: this.primaryRanker.providerType,
            modelVersion: this.primaryRanker.modelVersion,
            processingDurationMs: durationMs,
            occurredAt: new Date().toISOString(),
          },
        });

        void this.outboxPublisher.triggerPublish();
        return;
      }

      // 5. Invoke Ranking Provider (Mock AI or Fallback)
      let rankingResponse: RankingResponseDto;

      try {
        rankingResponse = await this.primaryRanker.rank({
          serviceRequestId,
          requestRevision,
          serviceId,
          requestDescription: description,
          requestLatitude: latitude,
          requestLongitude: longitude,
          candidates: eligibleCandidates,
          topN: 20,
          simulationOptions,
        });
      } catch (rankingErr) {
        this.logger.error(
          `Primary ranker failed: ${(rankingErr as Error).message}. Activating RuleBasedFallbackRanker...`,
        );

        // Fallback ranker execution
        rankingResponse = await this.fallbackRanker.rank({
          serviceRequestId,
          requestRevision,
          serviceId,
          requestDescription: description,
          requestLatitude: latitude,
          requestLongitude: longitude,
          candidates: eligibleCandidates,
          topN: 20,
        });
      }

      // 6. Validate Ranking Output Invariants
      this.rankingValidator.validateRankingOutput(
        rankingResponse,
        eligibleWorkerIds,
        20,
      );

      // 7. Persist Results (Top 20) and update MatchRun status transactionally
      const durationMs = Date.now() - startTime;
      const { isStaleRevision, savedResultCount } =
        await this.matchRunRepo.persistMatchResults({
          matchRunId: matchRun.id,
          serviceRequestId,
          requestRevision,
          candidateCount: eligibleCandidates.length,
          results: rankingResponse.rankedWorkers,
          modelVersion: rankingResponse.modelVersion,
          outboxPayload: (isStale: boolean) => ({
            eventId: crypto.randomUUID(),
            eventType: 'matching.completed',
            requestId: serviceRequestId,
            requestRevision,
            matchRunId: matchRun.id,
            candidateCount: eligibleCandidates.length,
            resultCount: rankingResponse.rankedWorkers.length,
            rankingProvider: rankingResponse.providerType,
            modelVersion: rankingResponse.modelVersion,
            processingDurationMs: durationMs,
            isStaleRevision: isStale,
            occurredAt: new Date().toISOString(),
          }),
        });

      this.logger.log(
        `Persisted ${savedResultCount} matching results for request ${serviceRequestId} in ${durationMs}ms (staleRevision: ${isStaleRevision})`,
      );

      // 8. Trigger Outbox Publisher
      void this.outboxPublisher.triggerPublish();
    } catch (error) {
      const errorMessage = (error as Error).message || 'Orchestration failed';
      this.logger.error(
        `Matching orchestration failed for request ${serviceRequestId}: ${errorMessage}`,
      );

      await this.matchRunRepo.failMatchRun({
        matchRunId: matchRun.id,
        errorMessage,
        outboxPayload: {
          eventId: crypto.randomUUID(),
          eventType: 'matching.failed',
          requestId: serviceRequestId,
          requestRevision,
          matchRunId: matchRun.id,
          error: errorMessage,
          occurredAt: new Date().toISOString(),
        },
      });

      void this.outboxPublisher.triggerPublish();
      throw error;
    }
  }
}
