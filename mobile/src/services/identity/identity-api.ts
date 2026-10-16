import { ApiClient } from '@/services/api/api-client';

export type IdentityJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type IdentityJobError = {
  message: string;
  code?: string;
  similarity?: number;
  [key: string]: unknown;
};

export type IdentityVerificationJobResponse = {
  success: boolean;
  message: string;
  data: {
    jobId: string;
    status: IdentityJobStatus;
    statusUrl?: string;
  };
};

export type IdentityJobStatusResponse = {
  success: boolean;
  data: {
    job_id: string;
    user_id: string;
    status: IdentityJobStatus;
    result_id?: string;
    error?: IdentityJobError | null;
    result?: {
      id: string;
      user_id: string;
      ocr: Record<string, unknown>;
      face_verification: {
        selfie_image: string;
        cropfromCCCD: string;
        status: 'match' | 'review' | 'not_match';
        is_match: boolean;
        needs_review: boolean;
        similarity: number;
      };
    };
    created_at?: string;
    updated_at?: string;
  };
};

export type IdentityVerificationResponse = IdentityVerificationJobResponse;

function imageFile(uri: string, name: string): Blob {
  const extension = uri.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const isPng = extension === 'png';
  return {
    uri,
    name: `${name}.${isPng ? 'png' : 'jpg'}`,
    type: isPng ? 'image/png' : 'image/jpeg',
  } as unknown as Blob;
}

export const IdentityApi = {
  /**
   * Submit CCCD and selfie images to AI async verification queue.
   * Non-blocking, returns HTTP 202 with jobId.
   */
  verify: async (payload: { idFrontUri: string; selfieUri: string }): Promise<IdentityVerificationJobResponse> => {
    const formData = new FormData();
    formData.append('cccd_image', imageFile(payload.idFrontUri, 'cccd'));
    formData.append('selfie_image', imageFile(payload.selfieUri, 'selfie'));

    return ApiClient.post<IdentityVerificationJobResponse>(
      '/identity/verify',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
  },

  /**
   * Check status of verification job in Redis queue.
   */
  getJobStatus: async (jobId: string): Promise<IdentityJobStatusResponse> => {
    return ApiClient.get<IdentityJobStatusResponse>(`/identity/jobs/${jobId}`);
  },

  /**
   * Poll verification job until completed or failed.
   */
  pollJob: async (
    jobId: string,
    onProgress?: (status: IdentityJobStatus) => void,
    maxAttempts = 40,
    intervalMs = 2000,
  ): Promise<IdentityJobStatusResponse['data']> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const res = await IdentityApi.getJobStatus(jobId);
      const job = res.data;
      onProgress?.(job.status);
      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }
    }
    throw new Error('Hết thời gian chờ xử lý kết quả xác minh từ AI. Vui lòng thử lại sau.');
  },
};
