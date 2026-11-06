import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ChatApi } from '../chat-api';
import { ChatEntry } from '../chat-entry';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../chat-api', () => ({
  ChatApi: { create: jest.fn() },
  chatErrorMessage: () => 'Chưa thể nhắn tin',
}));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ isAuthenticated: true, user: { id: 'participant' } }),
}));
function setup(bidId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ChatEntry bidId={bidId} />
    </QueryClientProvider>,
  );
  return {
    ...view,
    close: () => {
      view.unmount();
      client.clear();
    },
  };
}
beforeEach(() => jest.clearAllMocks());
it('does not offer chat or create a conversation before persisted bid exists', () => {
  const view = setup();
  expect(screen.queryByText('Nhắn tin')).toBeNull();
  expect(ChatApi.create).not.toHaveBeenCalled();
  view.close();
});
it('requires backend send permission before showing entry and rechecks on open', async () => {
  (ChatApi.create as jest.Mock).mockResolvedValue({
    id: 'conversation',
    permissions: { read: true, send: true },
  });
  const view = setup('persisted-bid');
  expect(await screen.findByText('Nhắn tin')).toBeTruthy();
  fireEvent.press(screen.getByText('Nhắn tin'));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith('/chat/conversation'),
  );
  expect(ChatApi.create).toHaveBeenNthCalledWith(1, 'persisted-bid');
  expect(ChatApi.create).toHaveBeenNthCalledWith(2, 'persisted-bid');
  view.close();
});
it('hides entry when server denies bid access', async () => {
  (ChatApi.create as jest.Mock).mockRejectedValue(new Error('CHAT_INELIGIBLE'));
  const view = setup('withdrawn-bid');
  await waitFor(() => expect(ChatApi.create).toHaveBeenCalled());
  expect(screen.queryByText('Nhắn tin')).toBeNull();
  view.close();
});
