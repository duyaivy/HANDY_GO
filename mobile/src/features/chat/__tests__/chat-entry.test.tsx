import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
it('keeps chat disabled without creating a conversation before a persisted bid exists', () => {
  const view = setup();
  expect(screen.getByRole('button', { name: 'Nhắn tin' })).toBeDisabled();
  expect(ChatApi.create).not.toHaveBeenCalled();
  view.close();
});
it('mounts multiple bids without POST and creates only the pressed conversation', async () => {
  (ChatApi.create as jest.Mock).mockResolvedValue({ id: 'conversation', permissions: { read: true, send: true } });
  render(
    <>
      <ChatEntry bidId="first-bid" />
      <ChatEntry bidId="second-bid" />
    </>,
  );
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Nhắn tin' })).toHaveLength(2));
  expect(ChatApi.create).not.toHaveBeenCalled();
  fireEvent.press(screen.getAllByRole('button', { name: 'Nhắn tin' })[1]);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/chat/conversation'));
  expect(ChatApi.create).toHaveBeenCalledTimes(1);
  expect(ChatApi.create).toHaveBeenCalledWith('second-bid');
});
it('handles denied access after a press without navigation', async () => {
  (ChatApi.create as jest.Mock).mockRejectedValue(new Error('CHAT_INELIGIBLE'));
  const view = setup('withdrawn-bid');
  expect(ChatApi.create).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Nhắn tin'));
  await waitFor(() => expect(ChatApi.create).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nhắn tin' })).toBeEnabled());
  expect(mockPush).not.toHaveBeenCalled();
  view.close();
});
it('does not navigate when the server denies send permission', async () => {
  (ChatApi.create as jest.Mock).mockResolvedValue({ id: 'conversation', permissions: { read: true, send: false } });
  const view = setup('persisted-bid');
  fireEvent.press(screen.getByText('Nhắn tin'));
  await waitFor(() => expect(ChatApi.create).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nhắn tin' })).toBeEnabled());
  expect(mockPush).not.toHaveBeenCalled();
  view.close();
});
it('does not create twice while a press is pending', async () => {
  let resolve!: (value: unknown) => void;
  (ChatApi.create as jest.Mock).mockImplementation(() => new Promise((r) => {
    resolve = r;
  }));
  const view = setup('persisted-bid');
  const button = screen.getByRole('button', { name: 'Nhắn tin' });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(ChatApi.create).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ id: 'conversation', permissions: { read: true, send: true } }));
  expect(mockPush).toHaveBeenCalledTimes(1);
  view.close();
});
