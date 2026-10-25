import { ApiClient } from '@/services/api/api-client';

// Verified against docs/contracts/notification-service.openapi.json.
export type NotificationRecord = {
  id: string;
  category: 'request' | 'matching' | 'bidding' | 'proposal' | 'order' | 'payment' | 'wallet' | 'system';
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type NotificationPage = { items: NotificationRecord[]; nextCursor: string | null };
export type RegisteredDevice = {
  id: string;
  platform: 'android' | 'ios' | 'web';
  deviceId: string | null;
  provider: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type NotificationPreferences = {
  pushEnabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
};
export type UpdateNotificationPreferencesDto = Partial<NotificationPreferences>;
type Envelope<T> = { statusCode: number; message: string; data: T };
const base = '/notifications';

export const NotificationApi = {
  list: async (cursor?: string, signal?: AbortSignal) =>
    (await ApiClient.get<Envelope<NotificationPage>>(base, { params: { limit: 20, cursor }, signal })).data,
  unreadCount: async (signal?: AbortSignal) =>
    (await ApiClient.get<Envelope<{ count: number }>>(`${base}/unread-count`, { signal })).data,
  detail: async (id: string, signal?: AbortSignal) =>
    (await ApiClient.get<Envelope<NotificationRecord>>(`${base}/${encodeURIComponent(id)}`, { signal })).data,
  markRead: async (id: string, signal?: AbortSignal) =>
    (await ApiClient.patch<Envelope<NotificationRecord>>(`${base}/${encodeURIComponent(id)}/read`, undefined, { signal })).data,
  markAllRead: async (signal?: AbortSignal) =>
    (await ApiClient.post<Envelope<{ updatedCount: number }>>(`${base}/read-all`, undefined, { signal })).data,
  getPreferences: async (signal?: AbortSignal) =>
    (await ApiClient.get<Envelope<NotificationPreferences>>(`${base}/preferences`, { signal })).data,
  updatePreferences: async (body: UpdateNotificationPreferencesDto, signal?: AbortSignal) =>
    (await ApiClient.patch<Envelope<NotificationPreferences>>(`${base}/preferences`, body, { signal })).data,
  register: async (body: { platform: 'android'; deviceId: string; pushToken: string }, signal?: AbortSignal) =>
    (await ApiClient.post<Envelope<RegisteredDevice>>(`${base}/devices`, body, { signal, timeout: 5000 })).data,
  deactivate: async (id: string, signal?: AbortSignal) =>
    (await ApiClient.delete<Envelope<{ id: string; isActive: boolean }>>(`${base}/devices/${encodeURIComponent(id)}`, { signal, timeout: 5000 })).data,
};
