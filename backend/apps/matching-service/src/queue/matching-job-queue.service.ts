import {
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { MatchingJobPayload } from './matching-job.types.js';

export type JobProcessorFn = (job: MatchingJobPayload) => Promise<void>;

@Injectable()
export class MatchingJobQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchingJobQueueService.name);

  private readonly maxConcurrency: number;
  private readonly jobTimeoutMs: number;
  private readonly maxAttempts: number;

  private activeWorkers = 0;
  private queue: MatchingJobPayload[] = [];
  private processor: JobProcessorFn | null = null;
  private isShuttingDown = false;

  constructor() {
    this.maxConcurrency = parseInt(
      process.env.MATCHING_WORKER_CONCURRENCY || '5',
      10,
    );
    this.jobTimeoutMs = parseInt(
      process.env.MATCHING_JOB_TIMEOUT_MS || '30000',
      10,
    );
    this.maxAttempts = parseInt(
      process.env.MATCHING_MAX_RETRY_ATTEMPTS || '5',
      10,
    );
  }

  setProcessor(processor: JobProcessorFn): void {
    this.processor = processor;
  }

  /**
   * Enqueues a matching job for asynchronous, concurrency-bounded background execution.
   */
  async enqueue(job: MatchingJobPayload): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('MatchingJobQueue is shutting down. Cannot accept new jobs.');
    }

    job.attempt = job.attempt || 1;
    job.maxAttempts = job.maxAttempts || this.maxAttempts;

    this.queue.push(job);
    this.logger.debug(
      `Enqueued matching job ${job.jobId} for request ${job.serviceRequestId} (revision ${job.requestRevision}). Queue depth: ${this.queue.length}`,
    );

    this.processNext();
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.activeWorkers;
  }

  private processNext(): void {
    if (this.isShuttingDown) return;
    if (this.activeWorkers >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const job = this.queue.shift();
    if (!job) return;

    this.activeWorkers++;

    void this.executeJobWithTimeout(job).finally(() => {
      this.activeWorkers--;
      this.processNext();
    });
  }

  private async executeJobWithTimeout(job: MatchingJobPayload): Promise<void> {
    if (!this.processor) {
      this.logger.error('No job processor registered in MatchingJobQueueService');
      return;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Matching job ${job.jobId} timed out after ${this.jobTimeoutMs}ms`,
          ),
        );
      }, this.jobTimeoutMs);
      timer.unref?.();
    });

    try {
      await Promise.race([this.processor(job), timeoutPromise]);
      this.logger.log(
        `Matching job ${job.jobId} completed successfully for request ${job.serviceRequestId} (revision ${job.requestRevision})`,
      );
    } catch (error) {
      const currentAttempt = job.attempt || 1;
      const maxAttempts = job.maxAttempts || this.maxAttempts;
      const errorMessage = (error as Error).message || 'Unknown processing error';

      this.logger.error(
        `Matching job ${job.jobId} failed (attempt ${currentAttempt}/${maxAttempts}): ${errorMessage}`,
      );

      if (currentAttempt < maxAttempts && !this.isShuttingDown) {
        // Exponential backoff: 2^attempt * 500ms (1s, 2s, 4s, 8s...)
        const delayMs = Math.min(30000, Math.pow(2, currentAttempt) * 500);
        this.logger.log(
          `Scheduling retry for job ${job.jobId} in ${delayMs}ms...`,
        );

        setTimeout(() => {
          if (!this.isShuttingDown) {
            job.attempt = currentAttempt + 1;
            this.queue.push(job);
            this.processNext();
          }
        }, delayMs);
      } else {
        this.logger.error(
          `Matching job ${job.jobId} permanently failed after ${currentAttempt} attempts.`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.log('Gracefully shutting down MatchingJobQueueService...');

    // Wait for in-flight workers to finish (up to 5 seconds)
    const deadline = Date.now() + 5000;
    while (this.activeWorkers > 0 && Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, 200));
    }

    if (this.activeWorkers > 0) {
      this.logger.warn(
        `Force-stopping MatchingJobQueueService with ${this.activeWorkers} jobs still running.`,
      );
    }
  }
}
