import { ApiClient } from '@/services/api/api-client';

export type KycJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type KycWorkerStatus = 'draft' | 'pending_kyc' | 'under_review' | 'verified' | 'rejected' | 'suspended';

export type KycSubmitPayload = {
  idFrontUri: string;
  selfieUri: string;
  idDocumentType?: string;
  idNumber?: string;
  idempotencyKey?: string;
  onProgress?: (step: string) => void;
};

export type KycSubmitResponse = {
  statusCode: number;
  message: string;
  data: {
    kycCaseId: string;
    jobId: string;
    status: string;
    createdAt: string;
  };
};

export type KycJobStatusResponse = {
  statusCode: number;
  data: {
    jobId: string;
    kycCaseId: string;
    status: KycJobStatus;
    retryCount: number;
    failureReason?: string | null;
    aiResult?: {
      ocr?: Record<string, unknown>;
      faceVerification?: {
        isMatch: boolean;
        similarity: number;
        status: string;
        needsReview: boolean;
        message?: string;
      };
    } | null;
    startedAt?: string | null;
    completedAt?: string | null;
    createdAt: string;
  };
};

export type KycStatusResponse = {
  statusCode: number;
  data: {
    workerStatus: KycWorkerStatus;
    latestKycCase: {
      id: string;
      status: string;
      idDocumentType: string;
      documentFrontRef: string;
      selfieRef: string;
      aiSimilarityScore?: number | null;
      reviewNote?: string | null;
      submittedAt?: string | null;
      reviewedAt?: string | null;
    } | null;
    activeJob: {
      id: string;
      status: KycJobStatus;
      retryCount: number;
      failureReason?: string | null;
    } | null;
  };
};

function imageFile(uri: string, name: string): Blob {
  const extension = uri.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const isPng = extension === 'png';
  return {
    uri,
    name: `${name}.${isPng ? 'png' : 'jpg'}`,
    type: isPng ? 'image/png' : 'image/jpeg',
  } as unknown as Blob;
}

/**
 * Tải ảnh CCCD / selfie lên BE storage qua API Gateway (/api/v1/uploads/image)
 */
async function uploadImageToStorage(uri: string, fieldName: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', imageFile(uri, fieldName));

  const response = await ApiClient.post<{
    statusCode: number;
    message: string;
    data: { url: string };
  }>('/uploads/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (!response?.data?.url) {
    throw new Error(`Tải ảnh ${fieldName} lên máy chủ thất bại.`);
  }

  return response.data.url;
}

export const IdentityApi = {
  /**
   * Nộp hồ sơ KYC mới tới Backend (User Trust Service).
   * Tải ảnh lên BE Storage, tạo KycCase và AiAnalysisJob rồi trả về 202 Accepted.
   */
  submitKycVerification: async (payload: KycSubmitPayload): Promise<KycSubmitResponse> => {
    payload.onProgress?.('Đang tải ảnh CCCD lên máy chủ...');
    const documentFrontRef = await uploadImageToStorage(payload.idFrontUri, 'cccd');

    payload.onProgress?.('Đang tải ảnh khuôn mặt selfie...');
    const selfieRef = await uploadImageToStorage(payload.selfieUri, 'selfie');

    payload.onProgress?.('Đang gửi hồ sơ xác minh vào hàng đợi...');
    const idempotencyKey
      = payload.idempotencyKey || `kyc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    return ApiClient.post<KycSubmitResponse>(
      '/users/me/kyc',
      {
        idDocumentType: payload.idDocumentType || 'CCCD',
        idNumber: payload.idNumber,
        documentFrontRef,
        selfieRef,
        idempotencyKey,
      },
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  },

  /**
   * Alias tương thích ngược cho submitKycVerification
   */
  verify: async (payload: { idFrontUri: string; selfieUri: string }): Promise<KycSubmitResponse> => {
    return IdentityApi.submitKycVerification(payload);
  },

  /**
   * Lấy trạng thái xác minh KYC hiện tại của tài khoản (GET /api/v1/users/me/kyc)
   */
  getKycStatus: async (): Promise<KycStatusResponse> => {
    return ApiClient.get<KycStatusResponse>('/users/me/kyc');
  },

  /**
   * Kiểm tra tiến độ xử lý công việc AI (GET /api/v1/users/me/kyc/jobs/:jobId)
   */
  getJobStatus: async (jobId: string): Promise<KycJobStatusResponse> => {
    return ApiClient.get<KycJobStatusResponse>(`/users/me/kyc/jobs/${jobId}`);
  },

  /**
   * Polling kiểm tra trạng thái job xác minh AI cho đến khi hoàn thành hoặc thất bại
   */
  pollJob: async (
    jobId: string,
    onProgress?: (status: KycJobStatus) => void,
    options?: { maxAttempts?: number; intervalMs?: number },
  ): Promise<KycJobStatusResponse['data']> => {
    const maxAttempts = options?.maxAttempts ?? 40;
    const intervalMs = options?.intervalMs ?? 2000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
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
