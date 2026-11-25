import type { AuthUser } from '@/services/auth/auth-api';
import type { NotificationRecord } from '@/services/notifications/notification-api';
import { act, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { NotificationApi } from '@/services/notifications/notification-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { NotificationScreen } from '../notification-screen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: jest.fn(() => ({ back: jest.fn(), push: mockPush })) }));
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
it('optimistically marks all notifications as read', async () => {
  render(<NotificationScreen />);
  await screen.findByText(item.title);

  fireEvent.press(screen.getByTestId('mark-all-read-btn'));
  await waitFor(() => expect(NotificationApi.markAllRead).toHaveBeenCalled());
});

it('routes in-app booking_proposal.created to /worker?requestId=... and switches dual-role to Worker', async () => {
  useAuthStore.setState({
    user: { id: 'dual-prop-1', roles: ['Customer', 'Worker'] } as AuthUser,
    isAuthenticated: true,
    isHydrated: true,
    isLoading: false,
    activeMode: 'Customer',
  });
  const proposalItem: NotificationRecord = {
    id: 'prop-1',
    title: 'Đề nghị mới',
    body: 'Khách gửi đề nghị',
    category: 'proposal',
    payload: {
      eventType: 'booking_proposal.created',
      requestId: 'req-inapp-1',
      recipientRole: 'worker',
    },
    readAt: '2026-10-22T00:00:00Z',
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '',
  };
  jest.mocked(NotificationApi.list).mockResolvedValueOnce({ items: [proposalItem], nextCursor: null });

  render(<NotificationScreen />);
  await screen.findByText(proposalItem.title);
  fireEvent.press(screen.getByLabelText(`Đã đọc: ${proposalItem.title}`));

  expect(useAuthStore.getState().activeMode).toBe('Worker');
  expect(mockPush).toHaveBeenCalledWith('/worker?requestId=req-inapp-1');
});

it('routes in-app booking_proposal.changes_requested and booking_proposal.rejected to customer radar', async () => {
  useAuthStore.setState({
    user: { id: 'dual-prop-2', roles: ['Customer', 'Worker'] } as AuthUser,
    isAuthenticated: true,
    isHydrated: true,
    isLoading: false,
    activeMode: 'Worker',
  });
  const changesItem: NotificationRecord = {
    id: 'prop-2',
    title: 'Yêu cầu chỉnh sửa',
    body: 'Thợ yêu cầu chỉnh sửa',
    category: 'proposal',
    payload: {
      eventType: 'booking_proposal.changes_requested',
      requestId: 'req-inapp-2',
      recipientRole: 'customer',
    },
    readAt: '2026-10-22T00:00:00Z',
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '',
  };
  const rejectedItem: NotificationRecord = {
    id: 'prop-3',
    title: 'Đề nghị bị từ chối',
    body: 'Thợ từ chối đề nghị',
    category: 'proposal',
    payload: {
      eventType: 'booking_proposal.rejected',
      requestId: 'req-inapp-3',
      recipientRole: 'customer',
    },
    readAt: '2026-10-22T00:00:00Z',
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '',
  };
  jest.mocked(NotificationApi.list).mockResolvedValueOnce({ items: [changesItem, rejectedItem], nextCursor: null });

  render(<NotificationScreen worker />);
  await screen.findByText(changesItem.title);

  fireEvent.press(screen.getByLabelText(`Đã đọc: ${changesItem.title}`));
  expect(useAuthStore.getState().activeMode).toBe('Customer');
  expect(mockPush).toHaveBeenCalledWith('/customer/booking/radar?requestId=req-inapp-2');

  fireEvent.press(screen.getByLabelText(`Đã đọc: ${rejectedItem.title}`));
  expect(mockPush).toHaveBeenCalledWith('/customer/booking/radar?requestId=req-inapp-3');
});
