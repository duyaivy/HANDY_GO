import type { CreateReviewPayload, OrderReview, UpdateReviewPayload } from '@/features/orders/types/order.types';
import { ApiClient } from '@/services/api/api-client';

export type VideoUploadSignatureResponse = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
  uploadReceipt: string;
  publicId?: string;
};

export const ReviewsApi = {
  /**
   * Lấy thông tin đánh giá theo mã đơn hàng
   * Trả về null nếu đơn hàng chưa được đánh giá (404)
   */
  getOrderReview: async (orderId: string): Promise<OrderReview | null> => {
    try {
      const response = await ApiClient.get<{
        statusCode: number;
        message?: string;
        data: OrderReview;
      }>(`/reviews/orders/${orderId}`);

      return response?.data || (response as unknown as OrderReview) || null;
    }
    catch (err: any) {
      // 404 nghĩa là đơn hàng chưa có đánh giá
      const status = err?.response?.status || err?.status;
      if (status === 404) {
        return null;
      }
      const msg = String(err?.response?.data?.message || err?.message || '');
      if (msg.toLowerCase().includes('chưa có đánh giá') || msg.toLowerCase().includes('not found')) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Tạo đánh giá mới cho đơn hàng đã hoàn tất
   */
  createReview: async (payload: CreateReviewPayload): Promise<OrderReview> => {
    const url = payload.orderId ? `/orders/${payload.orderId}/reviews` : '/reviews';
    const response = await ApiClient.post<{
      statusCode: number;
      message?: string;
      data: OrderReview;
    }>(url, payload);

    return response?.data || (response as unknown as OrderReview);
  },

  /**
   * Chỉnh sửa đánh giá (trong vòng 48h, chỉ được sửa 1 lần duy nhất)
   */
  updateReview: async (reviewId: string, payload: UpdateReviewPayload): Promise<OrderReview> => {
    const response = await ApiClient.put<{
      statusCode: number;
      message?: string;
      data: OrderReview;
    }>(`/reviews/${reviewId}`, payload);

    return response?.data || (response as unknown as OrderReview);
  },

  /**
   * Lấy chữ ký direct upload video lên Cloudinary
   */
  getVideoUploadSignature: async (params: {
    fileName: string;
    mimeType: string;
    fileSize?: number;
  }): Promise<VideoUploadSignatureResponse> => {
    const response = await ApiClient.post<{
      statusCode: number;
      message?: string;
      data: VideoUploadSignatureResponse;
    }>('/reviews/video-upload-signature', params);

    return response?.data || (response as unknown as VideoUploadSignatureResponse);
  },
};
