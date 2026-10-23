import type { AuthUser } from '@/services/auth/auth-api';
import type { NotificationRecord } from '@/services/notifications/notification-api';
import { act, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { NotificationApi } from '@/services/notifications/notification-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { NotificationScreen } from '../notification-screen';

jest.mock('expo-router', () => ({ useRouter: jest.fn(() => ({ back: jest.fn() })) }));
jest.mock('@/services/notifications/notification-api', () => ({ NotificationApi: {
  list: jest.fn(),
  unreadCount: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
} }));
const item: NotificationRecord = { id: 'one', title: 'Thông báo mới', body: 'Nội dung', category: 'system', payload: null, readAt: null, createdAt: '2026-10-22T00:00:00Z', updatedAt: '' };
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'user-a' } as AuthUser, isAuthenticated: true, isHydrated: true, isLoading: false });
  jest.mocked(NotificationApi.list).mockResolvedValue({ items: [item], nextCursor: null });
  jest.mocked(NotificationApi.unreadCount).mockResolvedValue({ count: 1 });
});
it('renders notifications and synchronizes read status and count', async () => {
  jest.mocked(NotificationApi.markRead).mockImplementation(async () => {
    jest.mocked(NotificationApi.list).mockResolvedValue({ items: [{ ...item, readAt: item.createdAt }], nextCursor: null });
    jest.mocked(NotificationApi.unreadCount).mockResolvedValue({ count: 0 });
    return { ...item, readAt: item.createdAt };
  });
  render(<NotificationScreen />);
  await screen.findByText(item.title);
  fireEvent.press(screen.getByLabelText(`Chưa đọc: ${item.title}`));
  await screen.findByText('0 chưa đọc');
  expect(screen.getByLabelText(`Đã đọc: ${item.title}`)).toBeOnTheScreen();
});
it('supports cursor pagination and pull-to-refresh', async () => {
  jest.mocked(NotificationApi.list).mockResolvedValueOnce({ items: [item], nextCursor: 'cursor-1' });
  render(<NotificationScreen />);
  await screen.findByText(item.title);
  const { FlatList } = require('react-native');
  fireEvent(screen.UNSAFE_getByType(FlatList), 'onEndReached');
  await waitFor(() => expect(NotificationApi.list).toHaveBeenCalledWith('cursor-1', expect.any(AbortSignal)));
  fireEvent(screen.UNSAFE_getByType(FlatList), 'onRefresh');
  await waitFor(() => expect(NotificationApi.list).toHaveBeenCalledWith(undefined, expect.any(AbortSignal)));
});
it('renders empty and recoverable error states', async () => {
  jest.mocked(NotificationApi.list).mockRejectedValueOnce(new Error('offline'));
  const view = render(<NotificationScreen />);
  await screen.findByText('Thử lại');
  jest.mocked(NotificationApi.list).mockResolvedValue({ items: [], nextCursor: null });
  fireEvent.press(screen.getByText('Thử lại'));
  await screen.findByText('Chưa có thông báo');
  view.unmount();
});
it('isolates list queries across account switches', async () => {
  render(<NotificationScreen />);
  await screen.findByText(item.title);
  jest.mocked(NotificationApi.list).mockResolvedValue({ items: [], nextCursor: null });
  act(() => useAuthStore.setState({ user: { id: 'user-b' } as AuthUser }));
  await screen.findByText('Chưa có thông báo');
  expect(screen.queryByText(item.title)).toBeNull();
});
it('does not fetch while authentication is hydrating', () => {
  useAuthStore.setState({ isHydrated: false });
  render(<NotificationScreen />);
  expect(NotificationApi.list).not.toHaveBeenCalled();
});
