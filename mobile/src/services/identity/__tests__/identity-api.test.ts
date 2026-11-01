import { ApiClient, axiosInstance } from '@/services/api/api-client';
import { IdentityApi } from '../identity-api';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('identityApi - upload and submit', () => {
  it('uploads both CCCD and selfie using multipart FormData then submits KYC application', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const progressUpdates: string[] = [];
    let uploadCount = 0;

    const postSpy = jest.spyOn(ApiClient, 'post').mockImplementation(async (url: string, _data?: any) => {
      if (url === '/uploads/image') {
        uploadCount++;
        return {
          statusCode: 200,
          message: 'OK',
          data: { url: `https://res.cloudinary.com/demo/image/upload/${uploadCount === 1 ? 'cccd' : 'selfie'}.jpg` },
        } as any;
      }

      if (url === '/users/me/kyc') {
        return {
          statusCode: 202,
          message: 'Accepted',
          data: { kycCaseId: 'case-123', jobId: 'job-456', status: 'pending', createdAt: '2026-10-28T00:00:00Z' },
        } as any;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const response = await IdentityApi.submitKycVerification({
      idFrontUri: 'file:///path/to/cccd.jpg',
      selfieUri: 'file:///path/to/selfie.png',
      idNumber: '012345678901',
      onProgress: msg => progressUpdates.push(msg),
    });

    expect(response.data.kycCaseId).toBe('case-123');
    expect(response.data.jobId).toBe('job-456');
    expect(progressUpdates).toHaveLength(3);
    expect(postSpy).toHaveBeenCalledTimes(3);

    expect(appendSpy).toHaveBeenCalledWith('file', {
      uri: 'file:///path/to/cccd.jpg',
      name: 'cccd.jpg',
      type: 'image/jpeg',
    });

    expect(appendSpy).toHaveBeenCalledWith('file', {
      uri: 'file:///path/to/selfie.png',
      name: 'selfie.png',
      type: 'image/png',
    });

    const kycCall = postSpy.mock.calls[2];
    expect(kycCall[0]).toBe('/users/me/kyc');
    expect(kycCall[1]).toMatchObject({
      idDocumentType: 'CCCD',
      idNumber: '012345678901',
      documentFrontRef: expect.stringContaining('cccd.jpg'),
      selfieRef: expect.stringContaining('selfie.jpg'),
    });
    expect(kycCall[2]?.headers?.['Idempotency-Key']).toBeTruthy();
  });

  it('throws error if upload fails', async () => {
    jest.spyOn(ApiClient, 'post').mockResolvedValueOnce({
      statusCode: 200,
      message: 'OK',
      data: {} as any,
    });

    await expect(
      IdentityApi.submitKycVerification({
        idFrontUri: 'file:///cccd.jpg',
        selfieUri: 'file:///selfie.jpg',
      }),
    ).rejects.toThrow('Tải ảnh cccd lên máy chủ thất bại.');
  });
});

describe('identityApi - interceptor integration', () => {
  it('integration with ApiClient: KYC upload strips Content-Type: application/json without regression', async () => {
    const capturedConfigs: any[] = [];

    axiosInstance.defaults.adapter = async (config: any) => {
      capturedConfigs.push(config);
      if (config.url === '/uploads/image') {
        return {
          data: {
            statusCode: 200,
            message: 'OK',
            data: { url: 'https://res.cloudinary.com/demo/image/upload/uploaded.jpg' },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      if (config.url === '/users/me/kyc') {
        return {
          data: {
            statusCode: 202,
            message: 'Accepted',
            data: { caseId: 'case-1', jobId: 'job-1', status: 'pending' },
          },
          status: 202,
          statusText: 'Accepted',
          headers: {},
          config,
        };
      }

      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await IdentityApi.submitKycVerification({
      idFrontUri: 'file:///cccd.jpg',
      selfieUri: 'file:///selfie.jpg',
    });

    expect(capturedConfigs).toHaveLength(3);
    expect(capturedConfigs[0].url).toBe('/uploads/image');
    expect(capturedConfigs[0].data).toBeInstanceOf(FormData);
    expect(capturedConfigs[0].headers.getContentType()).toBe(false);

    expect(capturedConfigs[1].url).toBe('/uploads/image');
    expect(capturedConfigs[1].data).toBeInstanceOf(FormData);
    expect(capturedConfigs[1].headers.getContentType()).toBe(false);

    expect(capturedConfigs[2].url).toBe('/users/me/kyc');
    expect(capturedConfigs[2].headers.getContentType()).toBe('application/json');
  });
});

describe('identityApi - status queries', () => {
  it('calls GET /users/me/kyc', async () => {
    const getSpy = jest.spyOn(ApiClient, 'get').mockResolvedValue({
      data: {
        workerStatus: 'verified',
        latestKycCase: {
          id: 'case-1',
          status: 'verified',
          idDocumentType: 'national_id',
          documentFrontRef: 'front',
          selfieRef: 'selfie',
        },
      },
    } as any);

    const res = await IdentityApi.getKycStatus();
    expect(getSpy).toHaveBeenCalledWith('/users/me/kyc');
    expect(res.data.workerStatus).toBe('verified');
  });

  it('calls GET /users/me/kyc/jobs/:jobId', async () => {
    const getSpy = jest.spyOn(ApiClient, 'get').mockResolvedValue({
      data: { jobId: 'job-99', status: 'completed' },
    } as any);

    const res = await IdentityApi.getJobStatus('job-99');
    expect(getSpy).toHaveBeenCalledWith('/users/me/kyc/jobs/job-99');
    expect(res.data.status).toBe('completed');
  });
});
