import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { MatchingJobPayload } from './matching-job.types.js';

export type JobProcessorFn = (
  job: MatchingJobPayload,
  signal?: AbortSignal,
) => Promise<void>;

interface InternalQueuedJob extends MatchingJobPayload {
  _resolve?: () => void;
  _reject?: (err: Error) => void;
}

@Injectable()
export class MatchingJobQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchingJobQueueService.name);

  private readonly maxConcurrency: number;
  private readonly jobTimeoutMs: number;
  private readonly maxAttempts: number;

  private activeWorkers = 0;
  private queue: InternalQueuedJob[] = [];
  private processor: JobProcessorFn | null = null;
  private isShuttingDown = false;
  private readonly controllers = new Set<AbortController>();

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
    if (
      ![this.maxConcurrency, this.jobTimeoutMs, this.maxAttempts].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    ) {
      throw new Error(
        'Matching concurrency, timeout and retry attempts must be positive integers',
      );
    }
  }

  setProcessor(processor: JobProcessorFn): void {
    this.processor = processor;
  }

  /**
   * Enqueues a matching job for asynchronous, concurrency-bounded background execution.
   */
  async enqueue(job: MatchingJobPayload): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error(
        'MatchingJobQueue is shutting down. Cannot accept new jobs.',
      );
    }

    job.attempt = job.attempt || 1;
    job.maxAttempts = job.maxAttempts || this.maxAttempts;

    this.queue.push(job);
    this.logger.debug(
      `Enqueued matching job ${job.jobId} for request ${job.serviceRequestId} (revision ${job.requestRevision}). Queue depth: ${this.queue.length}`,
    );

    this.processNext();
  }

  /**
   * Enqueues a matching job and waits until execution completes or permanently fails.
   * Keeps upstream consumers (e.g. RabbitMQ) from ACKing prematurely.
   */
  async enqueueAndWait(job: MatchingJobPayload): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const internalJob: InternalQueuedJob = {
        ...job,
        _resolve: resolve,
        _reject: reject,
      };
      this.enqueue(internalJob).catch(reject);
    });
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

  private async executeJobWithTimeout(job: InternalQueuedJob): Promise<void> {
    if (!this.processor) {
      this.logger.error(
        'No job processor registered in MatchingJobQueueService',
      );
      job._reject?.(
        new Error('No job processor registered in MatchingJobQueueService'),
      );
      return;
    }

    const abortController = new AbortController();
    job.deadlineAt = Date.now() + this.jobTimeoutMs;
    this.controllers.add(abortController);
    let timeoutTimer: NodeJS.Timeout | null = null;

    timeoutTimer = setTimeout(() => {
      abortController.abort(
        new Error(
          `Matching job ${job.jobId} timed out after ${this.jobTimeoutMs}ms`,
        ),
      );
    }, this.jobTimeoutMs);
    timeoutTimer.unref?.();

    try {
      // Do not release a concurrency slot while a timed-out processor is still running.
      await this.processor(job, abortController.signal);
      abortController.signal.throwIfAborted();

      if (timeoutTimer) clearTimeout(timeoutTimer);

      this.logger.log(
        `Matching job ${job.jobId} completed successfully for request ${job.serviceRequestId} (revision ${job.requestRevision})`,
      );
      job._resolve?.();
    } catch (error) {
      if (timeoutTimer) clearTimeout(timeoutTimer);

      const currentAttempt = job.attempt || 1;
      const maxAttempts = job.maxAttempts || this.maxAttempts;
      const errorMessage =
        (error as Error).message || 'Unknown processing error';

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
          } else {
            job._reject?.(
              new Error('MatchingJobQueue shutting down during retry'),
            );
          }
        }, delayMs);
      } else {
        this.logger.error(
          `Matching job ${job.jobId} permanently failed after ${currentAttempt} attempts.`,
        );
        job._reject?.(error as Error);
      }
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      this.controllers.delete(abortController);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    for (const controller of this.controllers)
      controller.abort(new Error('Matching worker shutting down'));
    for (const job of this.queue.splice(0))
      job._reject?.(new Error('Matching worker shutting down'));
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
