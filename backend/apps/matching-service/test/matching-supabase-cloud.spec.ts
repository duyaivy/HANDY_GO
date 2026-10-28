import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MatchingServiceModule } from '../src/matching-service.module.js';
import { MatchingOrchestratorService } from '../src/orchestrator/matching-orchestrator.service.js';
import { MatchRunRepository } from '../src/persistence/match-run.repository.js';
import { CustomerMatchingController } from '../src/controllers/customer-matching.controller.js';
import { CANDIDATE_PROVIDER } from '../src/candidates/candidate.provider.interface.js';
import { UserTrustPrismaService, MatchingPrismaService } from '@app/database';
import { UserTrustServiceService } from '../../user-trust-service/src/user-trust-service.service.js';

describe('Manual Supabase Cloud Matching Flow Verification', () => {
  let moduleRef: TestingModule;
  let orchestrator: MatchingOrchestratorService;
  let matchRunRepo: MatchRunRepository;
  let customerController: CustomerMatchingController;
  let matchingPrisma: MatchingPrismaService;
  let userTrustPrisma: UserTrustPrismaService;
  let userTrustService: UserTrustServiceService;

  const testRequestId = 'a0000000-0000-4000-8000-000000000001';
  const customerUserId = '9b364a7f-b818-41a6-b0ef-59ff10af8598';
  const testWorkerUserId = '067399f4-197a-4d11-a32d-74f1efebd55a';
  const airconServiceId = 'a26e3c78-f202-4ec0-a2f9-2462371d05a4';

  beforeAll(async () => {
    // Connect to Supabase Cloud directly
    matchingPrisma = new MatchingPrismaService();
    userTrustPrisma = new UserTrustPrismaService();
    await matchingPrisma.$connect();
    await userTrustPrisma.$connect();

    userTrustService = new UserTrustServiceService(userTrustPrisma as any);

    moduleRef = await Test.createTestingModule({
      imports: [MatchingServiceModule],
    })
      .overrideProvider(CANDIDATE_PROVIDER)
      .useValue({
        findCandidates: (params: any) => userTrustService.findWorkerCandidates(params),
        getWorkerMatchProfile: (workerUserId: string) =>
          userTrustService.getWorkerMatchProfile(workerUserId),
      })
      .compile();

    orchestrator = moduleRef.get<MatchingOrchestratorService>(MatchingOrchestratorService);
    matchRunRepo = moduleRef.get<MatchRunRepository>(MatchRunRepository);
    customerController = moduleRef.get<CustomerMatchingController>(CustomerMatchingController);
  });

  afterAll(async () => {
    await moduleRef.close();
    await matchingPrisma.$disconnect();
    await userTrustPrisma.$disconnect();
  });

  it('1. should query candidate discovery from Supabase and filter out ineligible workers', async () => {
    const candidates = await userTrustService.findWorkerCandidates({
      serviceId: airconServiceId,
      latitude: 16.060000,
      longitude: 108.210000,
      customerUserId,
    });

    console.log(`\n[SUPABASE TEST] Found ${candidates.length} eligible candidates in Da Nang`);

    // Verify eligible count
    expect(candidates.length).toBeGreaterThanOrEqual(5);

    // Verify Ineligible Worker 7 (unapproved KYC) is NOT in list
    const unapprovedWorker = candidates.find(
      (c) => c.workerUserId === '254c73f3-0e6b-4cf0-86b7-341b6906c796',
    );
    expect(unapprovedWorker).toBeUndefined();

    // Verify Ineligible Worker 8 (HCM city ~600km) is NOT in list
    const farWorker = candidates.find(
      (c) => c.workerUserId === 'd7d31baf-714d-40c3-b3ab-70926246f284',
    );
    expect(farWorker).toBeUndefined();

    // Verify Worker 1 (Trần Minh Hoàng) is close
    const worker1 = candidates.find((c) => c.workerUserId === testWorkerUserId);
    expect(worker1).toBeDefined();
    expect(worker1?.distanceKm).toBeLessThan(1.0);
  });

  it('2. should execute full matching orchestration and persist Top results to Supabase matching_service tables', async () => {
    await orchestrator.processMatchingJob({
      serviceRequestId: testRequestId,
      serviceId: airconServiceId,
      requestRevision: 1,
      runNumber: 1,
      customerUserId,
      description:
        'Cần vệ sinh 2 máy lạnh Daikin Inverter và kiểm tra nạp gas tại nhà, máy bị chảy nước và có mùi hôi.',
      latitude: 16.060000,
      longitude: 108.210000,
    });

    const activeRun = await matchRunRepo.getLatestCompletedRun(testRequestId);
    expect(activeRun).toBeDefined();
    expect(activeRun?.status).toBe('completed');
    expect(activeRun?.results.length).toBeGreaterThanOrEqual(5);

    console.log(
      `\n[SUPABASE TEST] Match Run ID: ${activeRun?.id}, Status: ${activeRun?.status}, Results: ${activeRun?.results.length}`,
    );
  });

  it('3. should return Top 5 ranked recommendations via Customer API endpoint', async () => {
    const res = await customerController.getRecommendations(
      testRequestId,
      { userId: customerUserId, roles: ['Customer'] } as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.recommendations.length).toBeLessThanOrEqual(5);
    expect(res.data.recommendations.length).toBeGreaterThan(0);

    const topRank = res.data.recommendations[0];
    expect(topRank.rank).toBe(1);
    expect(topRank.matchingScore).toBeGreaterThan(0);
    expect(topRank.workerUserId).toBe(testWorkerUserId);

    console.log('\n[SUPABASE TEST] Top 5 Customer Recommendations from Supabase Cloud:');
    console.table(
      res.data.recommendations.map((r) => ({
        Rank: r.rank,
        WorkerUserId: r.workerUserId,
        MatchResultId: r.matchResultId,
        MatchingScore: r.matchingScore,
      })),
    );
  });

  it('4. should return matching open service requests for the Worker feed API', async () => {
    const feed = await customerController.getDiscoverableRequests(
      { userId: testWorkerUserId, roles: ['Worker'] } as any,
    );

    expect(feed.statusCode).toBe(200);
    expect(feed.data.items.length).toBeGreaterThan(0);

    const matchedJob = feed.data.items.find((r) => r.id === testRequestId);
    expect(matchedJob).toBeDefined();
    expect(matchedJob?.requestCode).toBe('REQ-20261025-AIRCON');
    expect(matchedJob?.distanceKm).toBeDefined();
    expect(matchedJob?.distanceKm).toBeLessThan(1.0);

    console.log('\n[SUPABASE TEST] Worker Feed Matching Open Requests from Supabase Cloud:');
    console.table(
      feed.data.items.map((r) => ({
        Code: r.requestCode,
        Address: r.addressText,
        Distance: r.distanceKm + ' km',
      })),
    );
  });

});
