import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { RabbitMQService } from '@app/rabbitmq';
import type { DomainEvent } from '@app/common';
import { KycRepository } from './kyc.repository.js';
import { KYC_CONSTANTS } from './kyc.constants.js';

export interface KycJobProcessPayload {
  jobId: string;
  kycCaseId: string;
  workerProfileId: string;
  userId: string;
  documentFrontRef: string;
  documentBackRef?: string | null;
  selfieRef: string;
  idDocumentType?: string;
}

@Injectable()
export class KycWorkerService {
  private readonly logger = new Logger(KycWorkerService.name);
  private readonly aiServiceUrl: string;
  private readonly internalSecret: string;
  private readonly aiTimeoutMs: number;

  constructor(
    private readonly kycRepository: KycRepository,
    private readonly configService: ConfigService,
    @Optional()
    private readonly rabbitmq?: RabbitMQService,
  ) {
    this.aiServiceUrl =
      process.env.AI_SERVICE_URL || 'http://localhost:8000';
    this.internalSecret =
      process.env.INTERNAL_SERVICE_SECRET || '';
    this.aiTimeoutMs = process.env.AI_SERVICE_TIMEOUT_MS
      ? Number(process.env.AI_SERVICE_TIMEOUT_MS)
      : KYC_CONSTANTS.AI_INFERENCE_TIMEOUT_MS;
  }

  /**
   * Process a KYC AI analysis job from RabbitMQ.
   * Executed sequentially (prefetchCount: 1).
   */
  async processKycJob(
    event: DomainEvent<KycJobProcessPayload> | KycJobProcessPayload,
    context?: any,
  ): Promise<void> {
    const payload: KycJobProcessPayload =
      (event as any).data ? (event as any).data : event;
    const { jobId, kycCaseId, documentFrontRef, selfieRef } = payload;

    this.logger.log(`[KYC Worker] Started processing AI job ${jobId} for case ${kycCaseId}`);

    let channel: any = null;
    let originalMsg: any = null;
    if (context && typeof context.getChannelRef === 'function') {
      channel = context.getChannelRef();
      originalMsg = context.getMessage();
    }

    try {
      // 1. Guard against stale jobs and mark processing
      const markResult = await this.kycRepository.markJobProcessing(jobId, kycCaseId);
      if (markResult.isStale) {
        this.logger.warn(`[KYC Worker] Job ${jobId} is obsolete (activeJobId is different). Skipping.`);
        if (channel && originalMsg) channel.ack(originalMsg);
        return;
      }

      // 2. Fetch images from storage (Cloudinary or HTTP URL)
      const [frontBuffer, selfieBuffer] = await Promise.all([
        this.downloadImageBuffer(documentFrontRef),
        this.downloadImageBuffer(selfieRef),
      ]);

      // 3. Call AI Inference API: POST /internal/v1/identity/analyze
      const aiResponse = await this.callAiInferenceApi(frontBuffer, selfieBuffer);

      // 4. Handle response from AI Service
      if (aiResponse.success && aiResponse.data) {
        // AI completed OCR and face matching successfully
        await this.kycRepository.recordJobSuccessAndMoveToReview(
          jobId,
          kycCaseId,
          aiResponse.data,
        );

        this.logger.log(
          `[KYC Worker] Successfully processed AI analysis for job ${jobId}. Case ${kycCaseId} moved to 'reviewing'`,
        );

        if (channel && originalMsg) channel.ack(originalMsg);
      } else {
        // Non-retryable AI business failure (e.g. low quality, not a CCCD, OCR failed)
        const reason =
          aiResponse.message ||
          aiResponse.errorCode ||
          'AI không nhận diện được thẻ CCCD hoặc khuôn mặt không hợp lệ.';

        this.logger.warn(
          `[KYC Worker] AI inference business error for job ${jobId}: ${reason}`,
        );

        await this.kycRepository.recordJobFailure(
          jobId,
          kycCaseId,
          reason,
          markResult.job.retryCount,
          true, // final business failure -> sent to admin review
        );

        if (channel && originalMsg) channel.ack(originalMsg);
      }
    } catch (err) {
      // 5. Technical failure handling: network failure, timeout, 500 error
      const errorMsg = (err as Error).message || 'Technical error during AI inference';
      this.logger.error(`[KYC Worker] Technical error processing job ${jobId}: ${errorMsg}`);

      try {
        const job = await this.kycRepository.findJobById(jobId);
        const currentRetry = (job?.retryCount ?? 0) + 1;
        const maxRetries = job?.maxRetries ?? KYC_CONSTANTS.DEFAULT_MAX_RETRIES;

        if (currentRetry < maxRetries) {
          // Record retry attempt and NACK with requeue for retry
          this.logger.warn(
            `[KYC Worker] Retrying job ${jobId} (attempt ${currentRetry}/${maxRetries})...`,
          );
          await this.kycRepository.recordJobFailure(
            jobId,
            kycCaseId,
            errorMsg,
            currentRetry,
            false,
          );

          if (channel && originalMsg) {
            // Requeue for retry
            try {
              channel.nack(originalMsg, false, true);
            } catch (nackErr) {
              this.logger.warn(`[KYC Worker] Could not nack channel for retry: ${(nackErr as Error).message}`);
            }
          }
        } else {
          // Exceeded max retries -> route to Dead Letter Queue (DLQ)
          this.logger.error(
            `[KYC Worker] Job ${jobId} exceeded max retries (${maxRetries}). Moving to DLQ.`,
          );
          await this.kycRepository.recordJobFailure(
            jobId,
            kycCaseId,
            `Thất bại sau ${maxRetries} lần thử: ${errorMsg}`,
            currentRetry,
            true,
          );

          // Emit to DLQ
          if (this.rabbitmq) {
            try {
              await this.rabbitmq.emit(
                `${KYC_CONSTANTS.KYC_DLQ}.event`,
                {
                  jobId,
                  kycCaseId,
                  payload,
                  lastError: errorMsg,
                  failedAt: new Date().toISOString(),
                },
              );
            } catch (dlqErr) {
              this.logger.error(`[KYC Worker] Failed to send to DLQ: ${(dlqErr as Error).message}`);
            }
          }

          // ACK original message so queue is unblocked
          if (channel && originalMsg) {
            try {
              channel.ack(originalMsg);
            } catch (ackErr) {
              this.logger.warn(`[KYC Worker] Could not ack channel for DLQ: ${(ackErr as Error).message}`);
            }
          }
        }
      } catch (innerErr) {
        this.logger.error(`[KYC Worker] Error during failure recovery: ${(innerErr as Error).message}`);
        if (channel && originalMsg) {
          try {
            channel.nack(originalMsg, false, false);
          } catch {
            // channel may already be closed if socket dropped
          }
        }
      }
    }
  }

  private async downloadImageBuffer(url: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(
          `Failed to download image from storage (HTTP ${response.status} ${response.statusText}): ${url}`,
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callAiInferenceApi(
    frontBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<{ success: boolean; data?: any; errorCode?: string; message?: string }> {
    const targetUrl = `${this.aiServiceUrl.replace(/\/+$/, '')}/internal/v1/identity/analyze`;
    this.logger.log(`[KYC Worker] Calling AI inference at ${targetUrl}`);
    const formData = new FormData();

    formData.append(
      'cccd_image',
      new Blob([frontBuffer], { type: 'image/jpeg' }),
      'front.jpg',
    );
    formData.append(
      'selfie_image',
      new Blob([selfieBuffer], { type: 'image/jpeg' }),
      'selfie.jpg',
    );

    const headers: Record<string, string> = {};
    if (this.internalSecret) {
      headers['x-internal-secret'] = this.internalSecret;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.aiTimeoutMs,
    );

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      const bodyText = await res.text();
      let parsed: any;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = { message: bodyText };
      }

      if (res.status >= 500) {
        // Technical failure from AI Service -> triggers retry
        throw new Error(`AI Service 5xx Error (${res.status}): ${parsed.message || bodyText}`);
      }

      if (res.status === 400 || res.status === 422 || res.status === 415) {
        // Business failure (bad image, OCR could not find card, etc.)
        return {
          success: false,
          errorCode: parsed.detail?.errorCode || parsed.errorCode || 'AI_INFERENCE_ERROR',
          message: parsed.detail?.message || parsed.message || 'Lỗi nhận diện thẻ hoặc khuôn mặt',
        };
      }

      if (!res.ok) {
        throw new Error(`AI Service unexpected HTTP error (${res.status}): ${parsed.message || bodyText}`);
      }

      return parsed;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`AI Service request timed out after ${this.aiTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
