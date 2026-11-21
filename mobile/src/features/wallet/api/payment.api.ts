import type {
  CreateOrderPaymentPayload,
  CreateTopupPayload,
  OrderPaymentRecord,
  PaginatedTopups,
  TopupRecord,
} from '../types/payment.types';
import { ApiClient } from '@/services/api/api-client';

type ApiResponse<T> = { statusCode: number; message: string; data: T };

export const PaymentApi = {
  createTopup: (payload: CreateTopupPayload) =>
    ApiClient.post<ApiResponse<TopupRecord>>('/payments/topups', payload),

  getMyTopups: (params?: { page?: number; limit?: number }) =>
    ApiClient.get<ApiResponse<PaginatedTopups>>('/payments/topups', { params }),

  getTopupDetail: (topupId: string) =>
    ApiClient.get<ApiResponse<TopupRecord>>(`/payments/topups/${encodeURIComponent(topupId)}`),

  simulateTopup: (topupId: string, outcome: 'succeeded' | 'failed' = 'succeeded') =>
    ApiClient.post<ApiResponse<TopupRecord>>(
      `/payments/topups/${encodeURIComponent(topupId)}/simulate`,
      { outcome, confirmSimulated: true },
    ),

  openPayment: (payload: CreateOrderPaymentPayload) =>
    ApiClient.post<ApiResponse<OrderPaymentRecord>>('/payments', payload),

  payWithPoints: (paymentId: string) =>
    ApiClient.post<ApiResponse<OrderPaymentRecord>>(
      `/payments/${encodeURIComponent(paymentId)}/pay-with-points`,
      { confirm: true },
    ),

  getPaymentByOrder: (orderId: string) =>
    ApiClient.get<ApiResponse<OrderPaymentRecord>>(`/payments/order/${encodeURIComponent(orderId)}`),
  confirmCash: (paymentId: string) => ApiClient.post<ApiResponse<OrderPaymentRecord>>(`/payments/${encodeURIComponent(paymentId)}/confirm-cash`),
  getMyPayments: (params?: { page?: number; limit?: number }, signal?: AbortSignal) => ApiClient.get<ApiResponse<{ items: OrderPaymentRecord[]; page: number; limit: number; total: number; totalPages: number }>>('/payments/me', { params, ...(signal ? { signal } : {}) }),
};
