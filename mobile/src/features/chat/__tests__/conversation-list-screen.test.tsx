import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChatApi } from '../chat-api';
import { ConversationListScreen } from '../conversation-list-screen';

const mockPush = jest.fn();
let mockUserId = 'customer';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock('../chat-api', () => ({ ChatApi: { list: jest.fn() } }));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: mockUserId } }),
}));

const conversation = {
  id: 'conversation',
  requestId: 'request-uuid',
  customerId: 'customer',
  workerId: 'worker',
  customerName: 'Lan Nguyễn',
  workerName: 'Minh Trần',
  serviceName: 'Sửa máy lạnh',
  lastSequence: '1',
  readStates: [],
  permissions: { read: true, send: true },
};
function setup(items: unknown[]) {
  (ChatApi.list as jest.Mock).mockResolvedValue({ items, nextCursor: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ConversationListScreen /></QueryClientProvider>);
  return () => {
    view.unmount();
    client.clear();
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'customer';
});

it('shows the worker name and service and opens an eligible conversation', async () => {
  const close = setup([conversation]);
  expect(await screen.findByText('Minh Trần')).toBeTruthy();
  expect(screen.getByText('Sửa máy lạnh')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Minh Trần, Sửa máy lạnh' }));
  expect(mockPush).toHaveBeenCalledWith('/chat/conversation?name=Minh%20Tr%E1%BA%A7n');
  close();
});
it('opens read-only history when sending is disabled', async () => {
  const close = setup([{ ...conversation, permissions: { read: true, send: false } }]);
  const row = await screen.findByRole('button', { name: 'Minh Trần, Sửa máy lạnh' });
  expect(row).not.toBeDisabled();
  fireEvent.press(row);
  expect(mockPush).toHaveBeenCalled();
  close();
});
it('shows customer names for workers and uses readable fallbacks without UUIDs', async () => {
  mockUserId = 'worker';
  const close = setup([conversation, { ...conversation, id: 'other', customerName: null, serviceName: null }]);
  expect(await screen.findByText('Lan Nguyễn')).toBeTruthy();
  expect(await screen.findByText('Khách hàng')).toBeTruthy();
  expect(screen.getByText('Yêu cầu dịch vụ')).toBeTruthy();
  expect(screen.queryByText(/request-uuid/)).toBeNull();
  close();
});

it('renders avatar image when available, initial fallback when missing, and unread notification badge', async () => {
  const withAvatar = {
    ...conversation,
    id: 'conv-with-avatar',
    workerAvatarUrl: 'https://example.com/avatar.jpg',
    lastSequence: '5',
    readStates: [{ userId: 'customer', lastReadSequence: '2', conversationId: 'conv-with-avatar', updatedAt: '' }],
  };
  const withoutAvatar = {
    ...conversation,
    id: 'conv-fallback',
    workerAvatarUrl: null,
    workerName: 'Trần Quốc Bảo',
    lastSequence: '1',
    readStates: [{ userId: 'customer', lastReadSequence: '1', conversationId: 'conv-fallback', updatedAt: '' }],
  };
  const close = setup([withAvatar, withoutAvatar]);

  expect(await screen.findByTestId('conversation-avatar-conv-with-avatar')).toBeTruthy();
  expect(screen.getByTestId('conversation-avatar-fallback-conv-fallback')).toBeTruthy();
  expect(screen.getByText('TB')).toBeTruthy();
  expect(screen.getByTestId('conversation-unread-badge-conv-with-avatar')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.queryByTestId('conversation-unread-badge-conv-fallback')).toBeNull();
  close();
});
