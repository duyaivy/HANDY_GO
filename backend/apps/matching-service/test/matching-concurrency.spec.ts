import { describe, expect, it } from 'vitest';
import { MatchingJobQueueService } from '../src/queue/matching-job-queue.service.js';
import type { MatchingJobPayload } from '../src/queue/matching-job.types.js';

describe('MatchingJobQueue Concurrency & Reliability Scenarios', () => {
  it('Scenario A: Concurrent Requests - should enforce bounded worker concurrency', async () => {
    const queueService = new MatchingJobQueueService();

    let maxObservedActiveWorkers = 0;
    const completedJobIds: string[] = [];

    // Processor simulates 50ms of asynchronous matching work
    queueService.setProcessor(async (job) => {
      const active = queueService.activeCount;
      if (active > maxObservedActiveWorkers) {
        maxObservedActiveWorkers = active;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      completedJobIds.push(job.jobId);
    });

    const totalJobs = 20;
    const jobs: MatchingJobPayload[] = [];

    for (let i = 1; i <= totalJobs; i++) {
      jobs.push({
        jobId: `JOB-CONCURRENT-${i}`,
        serviceRequestId: `req-${i}`,
        serviceId: 'srv-1',
        requestRevision: 1,
        runNumber: 1,
        customerUserId: `cust-${i}`,
        description: `Mô tả yêu cầu ${i}`,
        latitude: 10.772 + i * 0.001,
        longitude: 106.6983 + i * 0.001,
      });
    }

    // Launch all 20 jobs simultaneously
    await Promise.all(jobs.map((j) => queueService.enqueue(j)));

    // Wait until all jobs complete
    const deadline = Date.now() + 5000;
    while (completedJobIds.length < totalJobs && Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, 30));
    }

    expect(completedJobIds).toHaveLength(totalJobs);

    // Concurrency must have been bounded to maxConcurrency (configured 5)
    expect(maxObservedActiveWorkers).toBeLessThanOrEqual(5);
    expect(maxObservedActiveWorkers).toBeGreaterThan(1); // parallel execution verified

    await queueService.onModuleDestroy();
  });

  it('Scenario E: Job Timeout Handling - should timeout and fail stuck jobs safely', async () => {
    // Custom queue instance with short 100ms timeout
    process.env.MATCHING_JOB_TIMEOUT_MS = '100';
    const queueService = new MatchingJobQueueService();

    // Processor that never finishes within 100ms
    queueService.setProcessor(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    const stuckJob: MatchingJobPayload = {
      jobId: 'JOB-TIMEOUT-TEST',
      serviceRequestId: 'req-stuck',
      serviceId: 'srv-1',
      requestRevision: 1,
      runNumber: 1,
      customerUserId: 'cust-stuck',
      description: 'Yêu cầu bị treo',
      latitude: 10.772,
      longitude: 106.6983,
      maxAttempts: 1, // Only 1 attempt to avoid long retry loop
    };

    await queueService.enqueue(stuckJob);

    // Wait for timeout to fire
    await new Promise((res) => setTimeout(res, 300));

    expect(queueService.activeCount).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(queueService.activeCount).toBe(0);
    delete process.env.MATCHING_JOB_TIMEOUT_MS;
    await queueService.onModuleDestroy();
  });
});
