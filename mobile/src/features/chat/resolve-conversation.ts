import type { Href } from 'expo-router';
import type { ChatConversation } from './types';
import { ChatApi, chatErrorMessage } from './chat-api';

export type ResolveConversationContext = {
  workerId?: string | null;
  workerName?: string | null;
  orderId?: string | null;
  requestId?: string | null;
  bidId?: string | null;
};

export class ChatResolutionError extends Error {
  constructor(
    public readonly code: 'CHAT_INELIGIBLE' | 'CHAT_READ_ONLY',
    message: string,
  ) {
    super(message);
    this.name = 'ChatResolutionError';
  }
}

export function canInitiateConversation(context: ResolveConversationContext): boolean {
  return Boolean(
    context.workerId
    && (context.bidId || context.requestId || context.orderId),
  );
}

export function buildConversationHref(
  conversation: Pick<ChatConversation, 'id' | 'workerName' | 'customerName'>,
  fallbackName?: string | null,
): Href {
  const peerName = (fallbackName || conversation.workerName || conversation.customerName || '').trim();
  return `/chat/${conversation.id}${peerName ? `?name=${encodeURIComponent(peerName)}` : ''}` as Href;
}

function matchesConversationContext(
  item: ChatConversation,
  context: ResolveConversationContext,
): boolean {
  const matchesPeer = !context.workerId
    || item.workerId === context.workerId
    || item.customerId === context.workerId;
  if (!matchesPeer) {
    return false;
  }
  if (context.orderId) {
    if (item.orderId) {
      return item.orderId === context.orderId;
    }
    return Boolean(context.requestId && item.requestId === context.requestId);
  }
  if (context.requestId) {
    return item.requestId === context.requestId;
  }
  return false;
}

export async function resolveConversationForContext(
  context: ResolveConversationContext,
): Promise<ChatConversation> {
  if (!canInitiateConversation(context)) {
    throw new ChatResolutionError(
      'CHAT_INELIGIBLE',
      'Hồ sơ chưa đủ điều kiện để bắt đầu cuộc trò chuyện.',
    );
  }

  if (context.requestId || context.orderId) {
    let cursor: string | undefined;
    const maxPages = 5;
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const page = await ChatApi.list(cursor);
      const match = (page.items || []).find(item =>
        matchesConversationContext(item, context),
      );
      if (match) {
        if (!match.permissions?.read) {
          throw new ChatResolutionError(
            'CHAT_INELIGIBLE',
            'Bạn không có quyền truy cập cuộc trò chuyện này.',
          );
        }
        return match;
      }
      if (!page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }
  }

  if (context.bidId) {
    const conversation = await ChatApi.create(context.bidId);
    if (!conversation.permissions?.read) {
      throw new ChatResolutionError(
        'CHAT_INELIGIBLE',
        'Bạn không có quyền truy cập cuộc trò chuyện này.',
      );
    }
    return conversation;
  }

  throw new ChatResolutionError(
    'CHAT_INELIGIBLE',
    'Chưa có cuộc trò chuyện nào được khởi tạo cho yêu cầu này.',
  );
}

export function resolveConversationErrorMessage(error: unknown): string {
  if (error instanceof ChatResolutionError) {
    return error.message;
  }
  return chatErrorMessage(error);
}
