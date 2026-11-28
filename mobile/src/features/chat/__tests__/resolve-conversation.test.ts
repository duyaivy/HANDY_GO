import type { ChatConversation } from '../types';
import { ChatApi } from '../chat-api';
import {
  buildConversationHref,
  canInitiateConversation,
  ChatResolutionError,
  resolveConversationErrorMessage,
  resolveConversationForContext,
} from '../resolve-conversation';

function makeConversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'conv-1',
    requestId: 'req-1',
    orderId: 'ord-1',
    customerId: 'cust-1',
    workerId: 'worker-1',
    workerName: 'Nguyễn Văn Thợ',
    status: 'OPEN',
    lastSequence: '1',
    lastMessageAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    permissions: { read: true, send: true, reason: null },
    readStates: [],
    ...overrides,
  };
}

describe('resolveConversationForContext', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('opens an existing conversation matching orderId/requestId without calling create', async () => {
    const existing = makeConversation({ id: 'conv-existing', orderId: 'ord-1', requestId: 'req-1', workerId: 'worker-1' });
    const listSpy = jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({
      items: [existing],
      nextCursor: null,
    });
    const createSpy = jest.spyOn(ChatApi, 'create');

    const result = await resolveConversationForContext({
      workerId: 'worker-1',
      workerName: 'Nguyễn Văn Thợ',
      orderId: 'ord-1',
      requestId: 'req-1',
      bidId: 'bid-1',
    });

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).not.toHaveBeenCalled();
    expect(result.id).toBe('conv-existing');
    expect(buildConversationHref(result, 'Nguyễn Văn Thợ')).toBe('/chat/conv-existing?name=Nguy%E1%BB%85n%20V%C4%83n%20Th%E1%BB%A3');
  });

  it('creates a conversation via bidId when the order has no existing conversation yet', async () => {
    jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });
    const created = makeConversation({ id: 'conv-new', orderId: 'ord-2', requestId: 'req-2' });
    const createSpy = jest.spyOn(ChatApi, 'create').mockResolvedValueOnce(created);

    const result = await resolveConversationForContext({
      workerId: 'worker-1',
      orderId: 'ord-2',
      requestId: 'req-2',
      bidId: 'bid-2',
    });

    expect(createSpy).toHaveBeenCalledWith('bid-2');
    expect(result.id).toBe('conv-new');
  });

  it('selects the conversation matching the current requestId/orderId when customer has multiple requests with the same worker', async () => {
    const convReqA = makeConversation({ id: 'conv-A', requestId: 'req-A', orderId: 'ord-A', workerId: 'worker-1' });
    const convReqB = makeConversation({ id: 'conv-B', requestId: 'req-B', orderId: 'ord-B', workerId: 'worker-1' });
    jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({
      items: [convReqA, convReqB],
      nextCursor: null,
    });
    const createSpy = jest.spyOn(ChatApi, 'create');

    const result = await resolveConversationForContext({
      workerId: 'worker-1',
      orderId: 'ord-B',
      requestId: 'req-B',
      bidId: 'bid-B',
    });

    expect(createSpy).not.toHaveBeenCalled();
    expect(result.id).toBe('conv-B');
  });

  it('does not reuse a conversation from a different request with the same worker when current order has none, and creates for current bidId', async () => {
    const convOtherOrder = makeConversation({ id: 'conv-A', requestId: 'req-A', orderId: 'ord-A', workerId: 'worker-1' });
    jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({
      items: [convOtherOrder],
      nextCursor: null,
    });
    const convForB = makeConversation({ id: 'conv-B', requestId: 'req-B', orderId: 'ord-B', workerId: 'worker-1' });
    const createSpy = jest.spyOn(ChatApi, 'create').mockResolvedValueOnce(convForB);

    const result = await resolveConversationForContext({
      workerId: 'worker-1',
      orderId: 'ord-B',
      requestId: 'req-B',
      bidId: 'bid-B',
    });

    expect(createSpy).toHaveBeenCalledWith('bid-B');
    expect(result.id).toBe('conv-B');
  });

  it('rejects ineligible profile without request/order/bid context and does not bypass BE', async () => {
    expect(canInitiateConversation({ workerId: 'worker-1' })).toBe(false);
    await expect(resolveConversationForContext({ workerId: 'worker-1' })).rejects.toThrow(ChatResolutionError);
  });

  it('propagates backend 403/CHAT_INELIGIBLE error when user lacks permission to create conversation', async () => {
    jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({ items: [], nextCursor: null });
    jest.spyOn(ChatApi, 'create').mockRejectedValueOnce({ code: 'CHAT_INELIGIBLE' });

    await expect(
      resolveConversationForContext({
        workerId: 'worker-1',
        orderId: 'ord-3',
        requestId: 'req-3',
        bidId: 'bid-3',
      }),
    ).rejects.toMatchObject({ code: 'CHAT_INELIGIBLE' });
    expect(resolveConversationErrorMessage({ code: 'CHAT_INELIGIBLE' })).toBe(
      'Cuộc trò chuyện hiện chỉ cho phép xem lịch sử.',
    );
  });

  it('rejects existing conversation if permissions.read is false', async () => {
    const denied = makeConversation({
      id: 'conv-denied',
      orderId: 'ord-1',
      permissions: { read: false, send: false, reason: 'CHAT_INELIGIBLE' },
    });
    jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({ items: [denied], nextCursor: null });

    await expect(
      resolveConversationForContext({
        workerId: 'worker-1',
        orderId: 'ord-1',
        requestId: 'req-1',
      }),
    ).rejects.toThrow(ChatResolutionError);
  });
});
