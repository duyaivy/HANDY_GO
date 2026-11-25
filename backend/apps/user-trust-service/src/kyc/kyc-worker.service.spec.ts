import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KycWorkerService } from './kyc-worker.service.js';
import { KYC_CONSTANTS } from './kyc.constants.js';

describe('KycWorkerService', () => {
  let worker: KycWorkerService;
  let repoMock: any;
  let configMock: any;
  let rabbitmqMock: any;
  let channelMock: any;
  let contextMock: any;

  beforeEach(() => {
    repoMock = {
      markJobProcessing: vi.fn(),
      recordJobSuccessAndMoveToReview: vi.fn(),
      recordJobFailure: vi.fn(),
      findJobById: vi.fn(),
    };

    configMock = {};
    rabbitmqMock = {
      emit: vi.fn().mockResolvedValue(true),
    };

    channelMock = {
      ack: vi.fn(),
      nack: vi.fn(),
    };

    contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({ content: 'msg' }),
    };

    worker = new KycWorkerService(repoMock, configMock as any, rabbitmqMock);
  });

  it('skips processing and ACKs if job is stale (activeJobId is different)', async () => {
    repoMock.markJobProcessing.mockResolvedValue({ isStale: true });

    await worker.processKycJob(
      { jobId: 'job-stale', kycCaseId: 'case-1', documentFrontRef: 'u1', selfieRef: 'u2' } as any,
      contextMock,
    );

    expect(channelMock.ack).toHaveBeenCalled();
    expect(repoMock.recordJobSuccessAndMoveToReview).not.toHaveBeenCalled();
  });

  it('processes AI inference successfully and ACKs', async () => {
    repoMock.markJobProcessing.mockResolvedValue({
      isStale: false,
      job: { retryCount: 0 },
    });

    // Mock fetch for image downloads and AI inference call
    const imageBuffer = Buffer.from('fake-image-bytes');
    const aiSuccessResponse = {
      success: true,
      data: {
        ocr: { id: '012345678901', fullName: 'Nguyen Van A' },
        faceVerification: { isMatch: true, similarity: 0.88 },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/internal/v1/identity/analyze')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(aiSuccessResponse),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => imageBuffer,
      } as any;
    });

    await worker.processKycJob(
      { jobId: 'job-1', kycCaseId: 'case-1', documentFrontRef: 'http://img/1', selfieRef: 'http://img/2' } as any,
      contextMock,
    );

    expect(repoMock.recordJobSuccessAndMoveToReview).toHaveBeenCalledWith(
      'job-1',
      'case-1',
      aiSuccessResponse.data,
    );
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('handles non-retryable AI business failure, marks failed and ACKs', async () => {
    repoMock.markJobProcessing.mockResolvedValue({
      isStale: false,
      job: { retryCount: 0 },
    });

    const aiFailResponse = {
      success: false,
      errorCode: 'OCR_FAILED',
      message: 'Không trích xuất được thông tin thẻ CCCD',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/internal/v1/identity/analyze')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(aiFailResponse),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('data'),
      } as any;
    });

    await worker.processKycJob(
      { jobId: 'job-1', kycCaseId: 'case-1', documentFrontRef: 'http://img/1', selfieRef: 'http://img/2' } as any,
      contextMock,
    );

    expect(repoMock.recordJobFailure).toHaveBeenCalledWith(
      'job-1',
      'case-1',
      aiFailResponse.message,
      0,
      true, // isFinalFailure = true
    );
    expect(channelMock.ack).toHaveBeenCalled();
  });

  it('retries with NACK when technical error occurs and retryCount < maxRetries', async () => {
    repoMock.markJobProcessing.mockResolvedValue({
      isStale: false,
      job: { retryCount: 0 },
    });
    repoMock.findJobById.mockResolvedValue({ retryCount: 0, maxRetries: 3 });

    // Simulate AI Service 500 error
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/internal/v1/identity/analyze')) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal AI model error',
        } as any;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('data'),
      } as any;
    });

    await worker.processKycJob(
      { jobId: 'job-1', kycCaseId: 'case-1', documentFrontRef: 'http://img/1', selfieRef: 'http://img/2' } as any,
      contextMock,
    );

    expect(repoMock.recordJobFailure).toHaveBeenCalledWith(
      'job-1',
      'case-1',
      expect.stringContaining('AI Service 5xx Error'),
      1,
      false, // isFinalFailure = false (retrying)
    );
    expect(channelMock.nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('routes to DLQ and ACKs when maxRetries is reached', async () => {
    repoMock.markJobProcessing.mockResolvedValue({
      isStale: false,
      job: { retryCount: 2 },
    });
    repoMock.findJobById.mockResolvedValue({ retryCount: 2, maxRetries: 3 });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/internal/v1/identity/analyze')) {
        return {
          ok: false,
          status: 503,
          text: async () => 'Service unavailable',
        } as any;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('data'),
      } as any;
    });

    await worker.processKycJob(
      { jobId: 'job-1', kycCaseId: 'case-1', documentFrontRef: 'http://img/1', selfieRef: 'http://img/2' } as any,
      contextMock,
    );

    expect(repoMock.recordJobFailure).toHaveBeenCalledWith(
      'job-1',
      'case-1',
      expect.stringContaining('Thất bại sau 3 lần thử'),
      3,
      true, // isFinalFailure = true
    );
    expect(rabbitmqMock.emit).toHaveBeenCalledWith(
      expect.stringContaining('.dlq.event'),
      expect.objectContaining({ jobId: 'job-1' }),
    );
    expect(channelMock.ack).toHaveBeenCalled();
  });

  describe('Timeout configuration', () => {
    const originalKycTimeout = process.env.KYC_AI_TIMEOUT_MS;
    const originalAiTimeout = process.env.AI_SERVICE_TIMEOUT_MS;

    afterEach(() => {
      if (originalKycTimeout !== undefined) {
        process.env.KYC_AI_TIMEOUT_MS = originalKycTimeout;
      } else {
        delete process.env.KYC_AI_TIMEOUT_MS;
      }
      if (originalAiTimeout !== undefined) {
        process.env.AI_SERVICE_TIMEOUT_MS = originalAiTimeout;
      } else {
        delete process.env.AI_SERVICE_TIMEOUT_MS;
      }
    });

    it('falls back to KYC_CONSTANTS.AI_INFERENCE_TIMEOUT_MS (360000ms) even if AI_SERVICE_TIMEOUT_MS is 15000ms', () => {
      delete process.env.KYC_AI_TIMEOUT_MS;
      process.env.AI_SERVICE_TIMEOUT_MS = '15000';

      const instance = new KycWorkerService(repoMock, configMock as any);
      expect(instance.timeoutMs).toBe(KYC_CONSTANTS.AI_INFERENCE_TIMEOUT_MS);
      expect(instance.timeoutMs).toBe(360000);
    });

    it('uses configured KYC_AI_TIMEOUT_MS when provided', () => {
      process.env.KYC_AI_TIMEOUT_MS = '120000';
      process.env.AI_SERVICE_TIMEOUT_MS = '15000';

      const instance = new KycWorkerService(repoMock, configMock as any);
      expect(instance.timeoutMs).toBe(120000);
    });

    it('falls back to default if KYC_AI_TIMEOUT_MS is invalid, fractional or out of bounds', () => {
      const invalidValues = [
        'invalid-number',
        'Infinity',
        '-Infinity',
        'NaN',
        '2147483648', // > 2^31-1 ms
        '1000000000000',
        '-5000',
        '0',
        '120000.5', // fractional
        '',
        '   ',
        '1000', // below MIN_MS (5000)
        '700000', // above MAX_MS (600000)
      ];

      for (const val of invalidValues) {
        process.env.KYC_AI_TIMEOUT_MS = val;
        const instance = new KycWorkerService(repoMock, configMock as any);
        expect(instance.timeoutMs).toBe(KYC_CONSTANTS.AI_INFERENCE_TIMEOUT_MS);
      }
    });

    it('identifies HTTP 504 as Azure ingress gateway timeout with clear message', async () => {
      repoMock.markJobProcessing.mockResolvedValue({
        isStale: false,
        job: { retryCount: 0 },
      });
      repoMock.findJobById.mockResolvedValue({ retryCount: 0, maxRetries: 3 });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/internal/v1/identity/analyze')) {
          return {
            ok: false,
            status: 504,
            text: async () => 'Gateway Timeout',
          } as any;
        }
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from('data'),
        } as any;
      });

      await worker.processKycJob(
        { jobId: 'job-504', kycCaseId: 'case-1', documentFrontRef: 'http://img/1', selfieRef: 'http://img/2' } as any,
        contextMock,
      );

      expect(repoMock.recordJobFailure).toHaveBeenCalledWith(
        'job-504',
        'case-1',
        expect.stringContaining('AI Service Ingress Gateway Timeout (504)'),
        1,
        false,
      );
    });
  });
});
