import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MatchingOrchestratorService } from '../src/orchestrator/matching-orchestrator.service.js';
import { TestCandidateAdapter } from '../src/candidates/test-candidate.adapter.js';
import { EligibilityService } from '../src/eligibility/eligibility.service.js';
import { FeatureBuilderService } from '../src/features/feature-builder.service.js';
import { MockAiRankingProvider } from '../src/ranking/mock-ai-ranking.provider.js';
import { RuleBasedFallbackRanker } from '../src/ranking/rule-based-fallback.ranker.js';
import { RankingValidatorService } from '../src/ranking/ranking-validator.service.js';
import type { MatchingJobPayload } from '../queue/matching-job.types.js';

describe('MatchingOrchestratorService E2E Workflow', () => {
  let candidateAdapter: TestCandidateAdapter;
  let eligibilityService: EligibilityService;
  let featureBuilder: FeatureBuilderService;
  let primaryRanker: MockAiRankingProvider;
  let fallbackRanker: RuleBasedFallbackRanker;
  let rankingValidator: RankingValidatorService;
  let mockMatchRunRepo: any;
  let mockOutboxPublisher: any;
  let orchestrator: MatchingOrchestratorService;

  beforeEach(() => {
    candidateAdapter = new TestCandidateAdapter();
    eligibilityService = new EligibilityService();
    featureBuilder = new FeatureBuilderService();
    primaryRanker = new MockAiRankingProvider(featureBuilder);
    fallbackRanker = new RuleBasedFallbackRanker(featureBuilder);
    rankingValidator = new RankingValidatorService();

    mockMatchRunRepo = {
      createOrGetRun: vi.fn().mockResolvedValue({
        id: 'run-uuid-1',
        serviceRequestId: 'req-1',
        serviceId: 'srv-1',
        requestRevision: 1,
        runNumber: 1,
        status: 'pending',
        displayLimit: 5,
      }),
      updateRunStatus: vi.fn().mockResolvedValue({}),
      persistMatchResults: vi.fn().mockResolvedValue({
        isStaleRevision: false,
        savedResultCount: 3,
      }),
      failMatchRun: vi.fn().mockResolvedValue({}),
    };

    mockOutboxPublisher = {
      triggerPublish: vi.fn().mockResolvedValue(1),
    };

    orchestrator = new MatchingOrchestratorService(
      mockMatchRunRepo,
      candidateAdapter,
      eligibilityService,
      featureBuilder,
      primaryRanker,
      fallbackRanker,
      rankingValidator,
      mockOutboxPublisher,
    );
  });

  const baseJob: MatchingJobPayload = {
    jobId: 'JOB-001',
    serviceRequestId: 'req-1',
    serviceId: 'srv-1',
    requestRevision: 1,
    runNumber: 1,
    customerUserId: 'cust-1',
    description: 'Sửa bồn cầu bị rò rỉ nước',
    latitude: 10.772,
    longitude: 106.6983,
  };

  it('Happy Path: should orchestrate discovery, eligibility, mock AI ranking, and persistence', async () => {
    // Populate candidate adapter with test workers
    candidateAdapter.setTestCandidates([
      {
        workerUserId: 'worker-A',
        workerProfileId: 'profile-A',
        offeringTitle: 'Thợ sửa điện nước chuyên nghiệp',
        offeringDescription: 'Chuyên sửa bồn cầu, vòi sen, đường ống rò rỉ',
        experienceYears: 5,
        centerLatitude: 10.775,
        centerLongitude: 106.7,
        radiusKm: 10.0,
        distanceKm: 0.8,
        averageRating: 4.9,
        ratingCount: 30,
        completedOrderCount: 50,
      },
      {
        workerUserId: 'worker-B',
        workerProfileId: 'profile-B',
        offeringTitle: 'Dịch vụ thông nghẹt sửa chữa',
        offeringDescription: 'Sửa chữa bồn cầu ống nước tại nhà',
        experienceYears: 2,
        centerLatitude: 10.78,
        centerLongitude: 106.71,
        radiusKm: 10.0,
        distanceKm: 2.5,
        averageRating: 4.5,
        ratingCount: 10,
        completedOrderCount: 15,
      },
    ]);

    await orchestrator.processMatchingJob(baseJob);

    // Verify status updated to processing
    expect(mockMatchRunRepo.updateRunStatus).toHaveBeenCalledWith(
      'run-uuid-1',
      'processing',
    );

    // Verify persistMatchResults called with Top ranked workers
    expect(mockMatchRunRepo.persistMatchResults).toHaveBeenCalledTimes(1);
    const persistArgs = mockMatchRunRepo.persistMatchResults.mock.calls[0][0];

    expect(persistArgs.matchRunId).toBe('run-uuid-1');
    expect(persistArgs.candidateCount).toBe(2);
    expect(persistArgs.results).toHaveLength(2);
    expect(persistArgs.results[0].workerUserId).toBe('worker-A'); // Better rating and closer
    expect(persistArgs.results[0].rank).toBe(1);
    expect(persistArgs.results[1].workerUserId).toBe('worker-B');
    expect(persistArgs.results[1].rank).toBe(2);

    // Verify Outbox domain event payload
    const payload =
      typeof persistArgs.outboxPayload === 'function'
        ? persistArgs.outboxPayload(false)
        : persistArgs.outboxPayload;
    expect(payload.eventType).toBe('matching.completed');
    expect(payload.requestId).toBe('req-1');
    expect(payload.candidateCount).toBe(2);
    expect(payload.resultCount).toBe(2);

    // Verify Outbox trigger
    expect(mockOutboxPublisher.triggerPublish).toHaveBeenCalledTimes(1);
  });

  it('Zero Eligible Candidates: should complete run with 0 results and emit matching.completed', async () => {
    // No candidates registered
    candidateAdapter.setTestCandidates([]);

    await orchestrator.processMatchingJob(baseJob);

    expect(mockMatchRunRepo.persistMatchResults).toHaveBeenCalledTimes(1);
    const persistArgs = mockMatchRunRepo.persistMatchResults.mock.calls[0][0];
    expect(persistArgs.candidateCount).toBe(0);
    expect(persistArgs.results).toHaveLength(0);
    expect(persistArgs.outboxPayload.eventType).toBe('matching.completed');
    expect(mockOutboxPublisher.triggerPublish).toHaveBeenCalledTimes(1);
  });

  it('Resilience: should automatically activate RuleBasedFallbackRanker if Primary Ranker fails', async () => {
    candidateAdapter.setTestCandidates([
      {
        workerUserId: 'worker-A',
        workerProfileId: 'profile-A',
        offeringTitle: 'Thợ sửa điện',
        offeringDescription: 'Sửa điện',
        experienceYears: 5,
        centerLatitude: 10.775,
        centerLongitude: 106.7,
        radiusKm: 10.0,
        distanceKm: 0.8,
        averageRating: 4.8,
        ratingCount: 15,
        completedOrderCount: 20,
      },
    ]);

    // Force primary ranker to fail
    vi.spyOn(primaryRanker, 'rank').mockRejectedValueOnce(
      new Error('Primary AI ranker timeout / connection error'),
    );
    const fallbackSpy = vi.spyOn(fallbackRanker, 'rank');

    await orchestrator.processMatchingJob(baseJob);

    // Verify fallback ranker was invoked
    expect(fallbackSpy).toHaveBeenCalledTimes(1);

    // Verify results were still persisted
    expect(mockMatchRunRepo.persistMatchResults).toHaveBeenCalledTimes(1);
    const persistArgs = mockMatchRunRepo.persistMatchResults.mock.calls[0][0];
    expect(persistArgs.results[0].workerUserId).toBe('worker-A');
    const fallbackPayload =
      typeof persistArgs.outboxPayload === 'function'
        ? persistArgs.outboxPayload(false)
        : persistArgs.outboxPayload;
    expect(fallbackPayload.rankingProvider).toBe('fallback');
  });

  it('Failure Recovery: should mark run failed and emit matching.failed on unrecoverable error', async () => {
    // Force candidate provider to throw unexpected error
    vi.spyOn(candidateAdapter, 'findCandidates').mockRejectedValueOnce(
      new Error('Database connectivity failure'),
    );

    await expect(orchestrator.processMatchingJob(baseJob)).rejects.toThrow(
      'Database connectivity failure',
    );

    expect(mockMatchRunRepo.failMatchRun).toHaveBeenCalledTimes(1);
    const failArgs = mockMatchRunRepo.failMatchRun.mock.calls[0][0];
    expect(failArgs.matchRunId).toBe('run-uuid-1');
    expect(failArgs.errorMessage).toContain('Database connectivity failure');
    expect(failArgs.outboxPayload.eventType).toBe('matching.failed');
    expect(mockOutboxPublisher.triggerPublish).toHaveBeenCalledTimes(1);
  });
});
