import type { ApiResponse } from '@/services/auth/auth-api';
import { ApiClient } from '@/services/api/api-client';

export type WorkerReviewCustomer = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
};

export type WorkerReviewItem = {
  id: string;
  orderId?: string | null;
  rating: number;
  attitudeRating?: number | null;
  qualityRating?: number | null;
  speedRating?: number | null;
  comment?: string | null;
  createdAt: string;
  customer: WorkerReviewCustomer;
};

export type WorkerRatingDistribution = Record<number, number>;

export type WorkerPublicProfileStats = {
  averageRating: number;
  ratingCount: number;
  completedOrderCount: number;
  orderCountTotal: number;
  ratingDistribution: WorkerRatingDistribution;
};

export type WorkerServiceOfferingItem = {
  id: string;
  serviceId: string;
  title?: string | null;
  description?: string | null;
  experienceYears?: number;
  isActive: boolean;
  imageUrl?: string | null;
  orderCount?: number;
  revenue?: number;
};

export type CategoryItem = {
  id: string;
  name: string;
  code?: string;
  iconUrl?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  isActive?: boolean;
};

export type ServiceItem = {
  id: string;
  categoryId: string;
  name: string;
  code?: string;
  description?: string | null;
  basePrice?: number | null;
  isActive?: boolean;
};

export type WorkerServiceRegistrationItem = {
  id: string;
  workerProfileId: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  categoryIds?: string[];
  services?: Array<{
    serviceId: string;
    serviceName?: string;
    categoryId?: string;
    categoryName?: string;
    title?: string;
    description?: string;
    experienceYears?: number;
    imageUrl?: string | null;
  }>;
  serviceArea?: {
    address?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
  };
  evidenceFiles?: Array<{
    url: string;
    fileType: 'image' | 'video';
    name?: string;
  }>;
};

export type SubmitServiceRegistrationPayload = {
  categoryIds: string[];
  services: Array<{
    serviceId: string;
    title?: string;
    description?: string;
    experienceYears?: number;
  }>;
  serviceArea: {
    address?: string;
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  evidenceFiles: Array<{
    url: string;
    fileType: 'image' | 'video';
    name?: string;
  }>;
  idempotencyKey?: string;
};

export type WorkerPublicProfileData = {
  id: string;
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  status: string;
  isVerified: boolean;
  verifiedAt?: string | null;
  approvedAt?: string | null;
  memberSince?: string | null;
  stats: WorkerPublicProfileStats;
  services?: WorkerServiceOfferingItem[];
  recentReviews?: WorkerReviewItem[];
};

export type WorkerReviewsListResponse = {
  statusCode: number;
  data: WorkerReviewItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export function extractDataArray<T>(payload: any): T[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload.data?.data)) {
    return payload.data.data;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

export const WorkersApi = {
  getWorkerPublicProfile: async (workerIdentifier: string): Promise<ApiResponse<WorkerPublicProfileData>> => {
    return ApiClient.get<ApiResponse<WorkerPublicProfileData>>(`/workers/${workerIdentifier}`);
  },

  getWorkerReviews: async (
    workerIdentifier: string,
    query?: { rating?: number; page?: number; limit?: number },
  ): Promise<WorkerReviewsListResponse> => {
    const params = new URLSearchParams();
    if (query?.rating !== undefined && query?.rating !== null) {
      params.append('rating', String(query.rating));
    }
    if (query?.page) {
      params.append('page', String(query.page));
    }
    if (query?.limit) {
      params.append('limit', String(query.limit));
    }
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return ApiClient.get<WorkerReviewsListResponse>(`/workers/${workerIdentifier}/reviews${queryString}`);
  },

  getCategories: async (): Promise<ApiResponse<CategoryItem[]>> => {
    try {
      const raw = await ApiClient.get<any>('/categories?limit=50&isActive=true');
      const items = extractDataArray<CategoryItem>(raw);
      return {
        statusCode: raw?.statusCode ?? 200,
        message: raw?.message ?? 'OK',
        data: items,
      };
    }
    catch (err) {
      console.warn('[WORKERS API] Lấy danh mục thất bại:', err);
      return {
        statusCode: 500,
        message: 'Lỗi lấy danh mục',
        data: [],
      };
    }
  },

  getServices: async (categoryId?: string): Promise<ApiResponse<ServiceItem[]>> => {
    try {
      const query = categoryId ? `?categoryId=${categoryId}&limit=100&isActive=true` : '?limit=100&isActive=true';
      const raw = await ApiClient.get<any>(`/services${query}`);
      const items = extractDataArray<ServiceItem>(raw);
      return {
        statusCode: raw?.statusCode ?? 200,
        message: raw?.message ?? 'OK',
        data: items,
      };
    }
    catch (err) {
      console.warn('[WORKERS API] Lấy dịch vụ thất bại:', err);
      return {
        statusCode: 500,
        message: 'Lỗi lấy dịch vụ',
        data: [],
      };
    }
  },

  getMyServiceRegistrations: async (): Promise<ApiResponse<WorkerServiceRegistrationItem[]>> => {
    return ApiClient.get<ApiResponse<WorkerServiceRegistrationItem[]>>('/workers/me/service-registrations');
  },

  submitServiceRegistration: async (
    payload: SubmitServiceRegistrationPayload,
  ): Promise<ApiResponse<WorkerServiceRegistrationItem>> => {
    return ApiClient.post<ApiResponse<WorkerServiceRegistrationItem>>(
      '/workers/me/service-registrations',
      payload,
      payload.idempotencyKey
        ? {
            headers: {
              'Idempotency-Key': payload.idempotencyKey,
            },
          }
        : undefined,
    );
  },

  updateServiceRegistration: async (
    registrationId: string,
    payload: SubmitServiceRegistrationPayload,
  ): Promise<ApiResponse<WorkerServiceRegistrationItem>> => {
    return ApiClient.put<ApiResponse<WorkerServiceRegistrationItem>>(
      `/workers/me/service-registrations/${registrationId}`,
      payload,
      payload.idempotencyKey
        ? {
            headers: {
              'Idempotency-Key': payload.idempotencyKey,
            },
          }
        : undefined,
    );
  },

  cancelServiceRegistration: async (
    registrationId: string,
  ): Promise<ApiResponse<{ id: string }>> => {
    return ApiClient.delete<ApiResponse<{ id: string }>>(
      `/workers/me/service-registrations/${registrationId}`,
    );
  },

  toggleServiceOffering: async (
    offeringId: string,
    isActive?: boolean,
  ): Promise<ApiResponse<{ id: string; serviceId: string; isActive: boolean }>> => {
    return ApiClient.patch<ApiResponse<{ id: string; serviceId: string; isActive: boolean }>>(
      `/workers/me/service-offerings/${offeringId}`,
      isActive !== undefined ? { isActive } : undefined,
    );
  },

  uploadEvidenceFile: async (formData: FormData): Promise<ApiResponse<{ url: string; fileType: 'image' | 'video' }>> => {
    return ApiClient.post<ApiResponse<{ url: string; fileType: 'image' | 'video' }>>(
      '/workers/me/evidence-upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );
  },

  createEvidenceVideoSignature: async (params: {
    fileName: string;
    mimeType: string;
    fileSize: number;
  }): Promise<ApiResponse<{
    uploadId: string;
    cloudName: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    publicId: string;
    folder: string;
    resourceType: string;
    uploadUrl: string;
  }>> => {
    return ApiClient.post('/workers/me/video-upload-signature', params);
  },
};
