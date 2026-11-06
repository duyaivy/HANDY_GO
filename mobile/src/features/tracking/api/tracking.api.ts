import { request } from '@/services/api/api-client';
import {
  computeMilestonesFromSummary,
  type TrackingSummaryResponse,
  type TrackingTimelineResponse,
} from '../types/tracking.types';

export const TrackingApi = {
  /**
   * Lấy bản tóm tắt tiến trình và các cột mốc đã đạt được.
   */
  async getSummary(serviceRequestId: string): Promise<TrackingSummaryResponse> {
    const raw = await request<TrackingSummaryResponse>({
      url: `/api/v1/tracking/requests/${encodeURIComponent(serviceRequestId)}/summary`,
      method: 'GET',
    });

    const summary: TrackingSummaryResponse = {
      ...raw,
      serviceRequestId: raw.serviceRequestId || serviceRequestId,
      lastUpdatedAt: raw.lastUpdatedAt || raw.updatedAt || raw.lastActivityAt || new Date().toISOString(),
      milestones: computeMilestonesFromSummary(raw),
    };

    return summary;
  },

  /**
   * Lấy danh sách dòng thời gian sự kiện chi tiết (có phân trang).
   */
  async getTimeline(
    serviceRequestId: string,
    params?: { page?: number; limit?: number },
  ): Promise<TrackingTimelineResponse> {
    const raw = await request<TrackingTimelineResponse>({
      url: `/api/v1/tracking/requests/${encodeURIComponent(serviceRequestId)}/timeline`,
      method: 'GET',
      params,
    });

    return {
      serviceRequestId: raw.serviceRequestId || serviceRequestId,
      items: raw.items || [],
      page: raw.page ?? 1,
      limit: raw.limit ?? 20,
      total: raw.total ?? (raw.items ? raw.items.length : 0),
      totalPages: raw.totalPages,
    };
  },
};
