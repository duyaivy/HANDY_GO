import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import { PushProvider, type PushMessage } from './push-provider.js';
import { PushJobRepository, type PushJobWithRelations } from './push-job.repository.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { PushPayloadBuilder } from './push-payload.builder.js';
import { PUSH_DEFAULTS } from './push.constants.js';

@Injectable()
export class PushWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private reclaimCounter = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly pushJobs: PushJobRepository,
    private readonly devices: DevicesRepository,
    private readonly provider: PushProvider,
  ) {}

  onModuleInit(): void {
    const pushEnabled = this.config.get('PUSH_ENABLED') === 'true';
    const workerEnabled = this.config.get('PUSH_WORKER_ENABLED') !== 'false';

    if (!pushEnabled || !workerEnabled) {
      this.logger.log(
        `Push worker disabled (PUSH_ENABLED=${pushEnabled}, PUSH_WORKER_ENABLED=${workerEnabled})`,
      );
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting Push notification worker polling loop');
    this.scheduleNextPoll(100); // quick start
  }

  async onModuleDestroy(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Wait if currently processing a batch
    let waitCount = 0;
    while (this.isProcessing && waitCount < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      waitCount++;
    }

    this.logger.log('Push worker stopped');
  }

  private scheduleNextPoll(delayMs?: number): void {
    if (!this.isRunning) return;

    const interval =
      delayMs ??
      Number(
        this.config.get('PUSH_WORKER_POLL_INTERVAL_MS') ||
          PUSH_DEFAULTS.POLL_INTERVAL_MS,
      );

    this.timer = setTimeout(() => {
      void this.pollCycle();
    }, interval);
  }

  /**
   * Executes a single worker polling cycle.
   */
  async pollCycle(): Promise<void> {
    if (!this.isRunning || this.isProcessing) return;

    this.isProcessing = true;
    try {
      // Periodically reclaim abandoned jobs (every 20 cycles)
      this.reclaimCounter++;
      if (this.reclaimCounter >= 20) {
        this.reclaimCounter = 0;
        const leaseTimeoutMs = Number(
          this.config.get('PUSH_WORKER_LEASE_TIMEOUT_MS') ||
            PUSH_DEFAULTS.LEASE_TIMEOUT_MS,
        );
        const reclaimed = await this.pushJobs.reclaimAbandonedJobs(leaseTimeoutMs);
        if (reclaimed > 0) {
          this.logger.warn(`Reclaimed ${reclaimed} abandoned push jobs`);
        }
      }

      const batchSize = Number(
        this.config.get('PUSH_WORKER_BATCH_SIZE') || PUSH_DEFAULTS.BATCH_SIZE,
      );
      const jobs = await this.pushJobs.claimPendingJobs(batchSize);

      if (jobs.length > 0) {
        await this.processJobs(jobs);
      }
    } catch (error) {
      this.logger.error(
        `Error during push worker poll cycle: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isProcessing = false;
      this.scheduleNextPoll();
    }
  }

  /**
   * Processes a batch of claimed push jobs.
   */
  async processJobs(jobs: PushJobWithRelations[]): Promise<void> {
    const maxRetries = Number(
      this.config.get('PUSH_MAX_RETRY_ATTEMPTS') ||
        PUSH_DEFAULTS.MAX_RETRY_ATTEMPTS,
    );

    const validJobs: PushJobWithRelations[] = [];
    const messages: PushMessage[] = [];

    for (const job of jobs) {
      if (!job.deviceToken || !job.deviceToken.isActive || !job.deviceToken.pushToken) {
        await this.pushJobs.markJobFailed(
          job.id,
          {
            attemptNo: job.attemptNo,
            maxRetries: 1,
            isTransient: false,
            errorMessage: 'Device token is missing or deactivated',
          },
          job.attemptedAt,
        );
        continue;
      }

      // Privacy / Ownership guard: do not deliver if the device has been rebound to another user
      if (job.deviceToken.userId !== job.notification.recipientUserId) {
        this.logger.warn(
          `Skipping push delivery for job ${job.id}: token owner ${job.deviceToken.userId} does not match recipient ${job.notification.recipientUserId}`,
        );
        await this.pushJobs.markJobFailed(
          job.id,
          {
            attemptNo: job.attemptNo,
            maxRetries: 1,
            isTransient: false,
            errorMessage: 'Device token ownership mismatch or rebound',
          },
          job.attemptedAt,
        );
        continue;
      }

      validJobs.push(job);
      const customPayload =
        typeof job.notification.payload === 'object' && job.notification.payload !== null
          ? (job.notification.payload as Record<string, unknown>)
          : undefined;

      const built = PushPayloadBuilder.build({
        notificationId: job.notification.id,
        title: job.notification.title,
        body: job.notification.body,
        eventType: job.notification.eventType,
        category: job.notification.category,
        sourceEntityId: job.notification.sourceEntityId,
        serviceRequestId: job.notification.serviceRequestId,
        recipientRole: customPayload?.recipientRole as string | undefined,
        customData: customPayload,
      });

      messages.push({
        jobId: job.id,
        token: job.deviceToken.pushToken,
        title: built.title,
        body: built.body,
        data: built.data,
      });
    }

    if (messages.length === 0) return;

    const results = await this.provider.sendEach(messages);
    const jobMap = new Map(validJobs.map((j) => [j.id, j]));

    for (const result of results) {
      const job = jobMap.get(result.jobId);
      if (!job) continue;

      if (result.success) {
        this.logger.log(
          `Successfully delivered push notification to FCM (jobId=${result.jobId}, messageId=${result.messageId || 'fcm_ack'})`,
        );
        await this.pushJobs.markJobSuccess(
          result.jobId,
          result.messageId || 'fcm_ack',
          job.attemptedAt,
        );
      } else {
        this.logger.warn(
          `Push notification failed (jobId=${result.jobId}, errorCode=${result.errorCode || 'UNKNOWN'}, error=${result.errorMessage})`,
        );
        await this.pushJobs.markJobFailed(
          result.jobId,
          {
            attemptNo: job.attemptNo,
            maxRetries,
            isTransient: result.isTransient,
            errorMessage: result.errorMessage,
          },
          job.attemptedAt,
        );

        if (result.shouldDeactivateToken && job.deviceToken) {
          this.logger.warn(
            `Deactivating invalid FCM token for deviceId=${job.deviceToken.id} (error: ${result.errorCode || result.errorMessage})`,
          );
          // Conditional deactivation: only deactivate if the token has not been rotated in the meantime
          await this.devices.deactivateIfTokenMatches(
            job.deviceToken.id,
            job.deviceToken.pushToken,
          );
        }
      }
    }
  }
}
