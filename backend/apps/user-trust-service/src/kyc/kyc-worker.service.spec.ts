import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KycWorkerService } from './kyc-worker.service.js';

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
});
