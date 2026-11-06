import type {
  ChatConversation,
  ChatEnvelope,
  ChatPage,
  ChatReadState,
  MessageHistoryPage,
  MessageListQuery,
} from './types';
import { ApiClient } from '@/services/api/api-client';
import { resolveChatBaseUrl } from './chat-config';

export const ChatApi = {
  create: async (bidId: string) =>
    (
      await ApiClient.post<ChatEnvelope<ChatConversation>>('/conversations', {
        bidId,
      }, { baseURL: resolveChatBaseUrl() })
    ).data,
  list: async (cursor?: string) =>
    (
      await ApiClient.get<ChatEnvelope<ChatPage<ChatConversation>>>(
        '/conversations',
        { baseURL: resolveChatBaseUrl(), params: { limit: 30, ...(cursor ? { cursor } : {}) } },
      )
    ).data,
  detail: async (id: string) =>
    (
      await ApiClient.get<ChatEnvelope<ChatConversation>>(
        `/conversations/${encodeURIComponent(id)}`,
        { baseURL: resolveChatBaseUrl() },
      )
    ).data,
  history: async (id: string, query: MessageListQuery = {}) =>
    (
      await ApiClient.get<ChatEnvelope<MessageHistoryPage>>(
        `/conversations/${encodeURIComponent(id)}/messages`,
        { baseURL: resolveChatBaseUrl(), params: { limit: 50, ...query } },
      )
    ).data,
  read: async (id: string, lastReadSequence: string) =>
    (
      await ApiClient.patch<ChatEnvelope<ChatReadState>>(
        `/conversations/${encodeURIComponent(id)}/read`,
        { lastReadSequence },
        { baseURL: resolveChatBaseUrl() },
      )
    ).data,
};
export function chatErrorMessage(error: unknown): string {
  const code
    = (error as { code?: string; response?: { data?: { code?: string } } })
      ?.response
      ?.data
      ?.code ?? (error as { code?: string })?.code;
  if (code === 'CONTACT_INFORMATION_BLOCKED')
    return 'Vui lòng không chia sẻ thông tin liên lạc hoặc thanh toán ngoài ứng dụng.';
  if (code === 'CHAT_READ_ONLY' || code === 'CHAT_INELIGIBLE')
    return 'Cuộc trò chuyện hiện chỉ cho phép xem lịch sử.';
  if (code === 'UNAUTHORIZED')
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (code === 'MEDIA_UNVERIFIED')
    return 'Chưa xác minh được tệp riêng tư. Vui lòng tải lại tệp.';
  if (code === 'RATE_LIMITED')
    return 'Bạn thao tác quá nhanh. Vui lòng đợi rồi thử lại.';
  return 'Không thể kết nối trò chuyện. Vui lòng thử lại.';
}
