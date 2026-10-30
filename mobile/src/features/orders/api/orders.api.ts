import type {
  BookingProposal,
  CreateBookingProposalPayload,
  CreateServiceRequestPayload,
  Order,
  OrderEvidence,
  OrderStatusHistoryItem,
  PaginatedList,
  ServiceRequest,
  UploadEvidencePayload,
} from '../types/order.types';
import { ApiClient } from '@/services/api/api-client';

function createFormImageFile(uri: string, name: string): Blob {
  const extension = uri.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const isPng = extension === 'png';
  return {
    uri,
    name: `${name}.${isPng ? 'png' : 'jpg'}`,
    type: isPng ? 'image/png' : 'image/jpeg',
  } as unknown as Blob;
}

export type UploadImageOptions = {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

export const OrdersApi = {
  // --- Service Requests ---
  createRequest: async (payload: CreateServiceRequestPayload) => {
    return ApiClient.post<{ statusCode: number; message: string; data: ServiceRequest }>(
      '/service-requests',
      payload,
    );
  },

  publishRequest: async (id: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: ServiceRequest }>(
      `/service-requests/${id}/publish`,
    );
  },

  cancelRequest: async (id: string, reason?: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: ServiceRequest }>(
      `/service-requests/${id}/cancel`,
      reason ? { reason } : undefined,
    );
  },

  getMyRequests: async (params?: Record<string, unknown>) => {
    return ApiClient.get<{ statusCode: number; message: string; data: PaginatedList<ServiceRequest> | ServiceRequest[] }>(
      '/service-requests',
      { params },
    );
  },

  getRequestDetail: async (id: string) => {
    return ApiClient.get<{ statusCode: number; message: string; data: ServiceRequest }>(
      `/service-requests/${id}`,
    );
  },

  getRequestById: async (id: string) => {
    return OrdersApi.getRequestDetail(id);
  },

  // --- Booking Proposals ---
  createProposal: async (payload: CreateBookingProposalPayload) => {
    return ApiClient.post<{ statusCode: number; message: string; data: BookingProposal }>(
      '/booking-proposals',
      payload,
    );
  },

  getMyWorkerProposals: async (params?: Record<string, unknown>) => {
    return ApiClient.get<{ statusCode: number; message: string; data: PaginatedList<BookingProposal> | BookingProposal[] }>(
      '/booking-proposals/me',
      { params },
    );
  },

  getProposalsForRequest: async (requestId: string) => {
    return ApiClient.get<{ statusCode: number; message: string; data: BookingProposal[] }>(
      `/service-requests/${requestId}/booking-proposals`,
    );
  },

  acceptProposal: async (id: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/booking-proposals/${id}/accept`,
    );
  },

  requestChanges: async (id: string, responseNote: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: BookingProposal }>(
      `/booking-proposals/${id}/request-changes`,
      { responseNote },
    );
  },

  // --- Orders ---
  getMyOrders: async (params?: Record<string, unknown>) => {
    return ApiClient.get<{ statusCode: number; message: string; data: PaginatedList<Order> | Order[] }>(
      '/orders',
      { params },
    );
  },

  getOrderDetail: async (id: string) => {
    return ApiClient.get<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}`,
    );
  },

  getStatusHistory: async (id: string) => {
    return ApiClient.get<{ statusCode: number; message: string; data: OrderStatusHistoryItem[] }>(
      `/orders/${id}/status-history`,
    );
  },

  confirmReadiness: async (id: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}/confirm-readiness`,
    );
  },

  startOrder: async (id: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}/start`,
    );
  },

  uploadEvidence: async (id: string, payload: UploadEvidencePayload) => {
    return ApiClient.post<{ statusCode: number; message: string; data: OrderEvidence }>(
      `/orders/${id}/evidence`,
      payload,
    );
  },

  finishOrder: async (id: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}/finish`,
    );
  },

  confirmCompletion: async (id: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}/confirm-completion`,
    );
  },

  requestRework: async (id: string, reason: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}/request-rework`,
      { reason },
    );
  },

  cancelOrder: async (id: string, cancelReason?: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}/cancel`,
      { cancelReason },
    );
  },

  openDispute: async (id: string, reason: string) => {
    return ApiClient.post<{ statusCode: number; message: string; data: Order }>(
      `/orders/${id}/dispute`,
      { reason },
    );
  },

  // --- Media Upload Helper ---
  uploadImage: async (
    uri: string,
    nameOrOptions: string | UploadImageOptions = 'order_media',
    maybeOptions?: UploadImageOptions,
  ): Promise<string> => {
    const name = typeof nameOrOptions === 'string' ? nameOrOptions : 'order_media';
    const options = typeof nameOrOptions === 'object' ? nameOrOptions : maybeOptions;

    const formData = new FormData();
    formData.append('file', createFormImageFile(uri, name));

    const response = await ApiClient.post<{
      statusCode: number;
      message: string;
      data: { url: string };
    }>('/uploads/image', formData, {
      signal: options?.signal,
      onUploadProgress: (event) => {
        if (event.total && event.total > 0) {
          const percent = Math.min(
            100,
            Math.max(0, Math.round((event.loaded * 100) / event.total)),
          );
          options?.onProgress?.(percent);
        }
      },
    });

    if (!response?.data?.url) {
      throw new Error('Upload ảnh thất bại.');
    }

    return response.data.url;
  },
};
