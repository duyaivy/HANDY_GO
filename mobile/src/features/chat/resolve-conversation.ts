import type { Href } from 'expo-router';
import type { ChatConversation } from './types';
import { ChatApi, chatErrorMessage } from './chat-api';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CONVERSATION_SCAN_PAGES = 50;

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

function buildListFilters(context: ResolveConversationContext) {
  const filters: {
    limit: number;
    requestId?: string;
    orderId?: string;
    workerId?: string;
  } = { limit: 100 };

  if (context.requestId && UUID_REGEX.test(context.requestId)) {
    filters.requestId = context.requestId;
  }
  if (context.orderId && UUID_REGEX.test(context.orderId)) {
    filters.orderId = context.orderId;
  }
  if (context.workerId && UUID_REGEX.test(context.workerId)) {
    filters.workerId = context.workerId;
  }
  return filters;
}

function isValidationFallbackError(error: unknown): boolean {
  const status = (error as { response?: { status?: number }; status?: number })?.response?.status
    ?? (error as { status?: number })?.status;
  const code = (error as { code?: string; response?: { data?: { code?: string } } })?.response?.data?.code
    ?? (error as { code?: string })?.code;
  return status === 400 || code === 'VALIDATION_ERROR';
}

async function scanConversations(
  context: ResolveConversationContext,
  filters?: { limit: number; requestId?: string; orderId?: string; workerId?: string },
): Promise<ChatConversation | null> {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  for (let pageIndex = 0; pageIndex < MAX_CONVERSATION_SCAN_PAGES; pageIndex += 1) {
    const page = await ChatApi.list(cursor, filters);
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
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
      break;
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return null;
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
    const filters = buildListFilters(context);
    const hasServerFilter = Boolean(filters.requestId || filters.orderId || filters.workerId);
    let existing: ChatConversation | null = null;
    try {
      existing = await scanConversations(context, hasServerFilter ? filters : { limit: 100 });
    }
    catch (error) {
      if (hasServerFilter && isValidationFallbackError(error)) {
        existing = await scanConversations(context);
      }
      else {
        throw error;
      }
    }
    if (existing) {
      return existing;
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
