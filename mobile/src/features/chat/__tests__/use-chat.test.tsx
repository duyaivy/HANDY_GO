import type { ChatMessage } from '../types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { ChatApi } from '../chat-api';
import { useChat } from '../use-chat';

const mockListeners = new Map<string, (value: never) => void>();
jest.mock('../chat-socket', () => ({
  chatSocket: {
    connected: () => true,
    onConnection: () => () => {},
    subscribe: (event: string, listener: (value: never) => void) => {
      mockListeners.set(event, listener);
      return () => mockListeners.delete(event);
    },
    request: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('../chat-api', () => ({
  ChatApi: {
    detail: jest.fn(),
    history: jest.fn(),
    read: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'self' } }),
}));
function message(sequence: string): ChatMessage {
  return {
    id: sequence,
    sequence,
    conversationId: 'chat',
    senderId: 'peer',
    clientMessageId: sequence,
    messageType: 'TEXT',
    content: 'Hello',
    replyToId: null,
    reply: null,
    attachments: [],
    createdAt: new Date().toISOString(),
  };
}
function setup(visible: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useChat('chat', visible), { wrapper });
  return { ...view, queryClient };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
  (ChatApi.detail as jest.Mock).mockResolvedValue({
    permissions: { send: true },
    readStates: [],
  });
  (ChatApi.history as jest.Mock).mockImplementation((_id, query) =>
    Promise.resolve({
      items: query?.afterSequence ? [] : [message('5')],
      nextBeforeSequence: null,
      nextAfterSequence: null,
      highWaterSequence: '5',
    }),
  );
});
it('fills missing persisted messages after an out-of-order socket delivery', async () => {
  const hook = setup(false);
  await waitFor(() => expect(hook.result.current.history.isSuccess).toBe(true));
  await waitFor(() =>
    expect(ChatApi.history).toHaveBeenCalledWith('chat', {
      afterSequence: '5',
    }),
  );
  (ChatApi.history as jest.Mock).mockResolvedValue({
    items: [message('6'), message('7')],
    nextAfterSequence: null,
    nextBeforeSequence: null,
    highWaterSequence: '7',
  });
  act(() => mockListeners.get('message.new')!(message('7') as never));
  await waitFor(() =>
    expect(hook.result.current.history.data?.contiguous).toBe('7'),
  );
  expect(
    hook.result.current.history.data?.items.map(item => item.sequence),
  ).toEqual(['5', '6', '7']);
  hook.unmount();
  hook.queryClient.clear();
});
it('never marks messages read while the conversation is not visible', async () => {
  const hook = setup(false);
  await waitFor(() => expect(hook.result.current.history.isSuccess).toBe(true));
  expect(ChatApi.read).not.toHaveBeenCalled();
  hook.unmount();
  hook.queryClient.clear();
});
it('marks persisted high water read only while focused in foreground', async () => {
  const original = AppState.currentState;
  AppState.currentState = 'active';
  const hook = setup(true);
  await waitFor(() => expect(ChatApi.read).toHaveBeenCalledWith('chat', '5'));
  hook.unmount();
  hook.queryClient.clear();
  AppState.currentState = original;
});
