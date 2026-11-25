import type { NotificationResponse } from 'expo-notifications';
import type { AuthUser } from '@/services/auth/auth-api';
import type { NotificationRecord } from '@/services/notifications/notification-api';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ordersQueryKeys } from '@/features/orders/hooks/orders-query-keys';
import { queryClient } from '@/lib/api/query-client';
import { act, render, waitFor } from '@/lib/test-utils';
import { NotificationApi } from '@/services/notifications/notification-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { NotificationLifecycle } from '../notification-lifecycle';
import { notificationIdFromData } from '../notification-payload';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: jest.fn(() => mockRouter), useRootNavigationState: jest.fn(() => ({ key: 'ready' })) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: null } }));
jest.mock('@/services/notifications/notification-api', () => ({ NotificationApi: { detail: jest.fn() } }));
jest.mock('@/services/notifications/push-registration', () => ({ nativePushSupported: () => true, setPushUser: jest.fn(), suspendPushRegistration: jest.fn(), syncPushRegistration: jest.fn(async () => {}), logoutPushRegistration: jest.fn() }));
const response = { actionIdentifier: 'default', notification: { request: { identifier: 'push-1', content: { data: { notificationId: '11111111-1111-4111-8111-111111111111' } } } } } as unknown as NotificationResponse;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  useAuthStore.setState({ user: { id: 'a' } as AuthUser, isHydrated: true, isAuthenticated: true, isLoading: false, activeMode: 'Customer' });
  jest.mocked(NotificationApi.detail).mockResolvedValue({} as never);
});
it('validates payloads', () => {
  expect(notificationIdFromData({ notificationId: '../bad' })).toBeNull();
  expect(notificationIdFromData(null)).toBeNull();
  expect(notificationIdFromData(response.notification.request.content.data)).toBeTruthy();
});
it('refreshes on foreground push, deduplicates taps, removes listeners', async () => {
  const refresh = jest.spyOn(queryClient, 'invalidateQueries');
  const view = render(<NotificationLifecycle />);
  const received = jest.mocked(Notifications.addNotificationReceivedListener).mock.calls[0][0];
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  act(() => received(response.notification));
  expect(refresh).toHaveBeenCalledWith({ queryKey: ['notifications', 'a'] });
  expect(refresh).toHaveBeenCalledWith({ queryKey: ordersQueryKeys.all });
  act(() => {
    tapped(response);
    tapped(response);
  });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
  expect(NotificationApi.detail).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(jest.mocked(Notifications.addNotificationReceivedListener).mock.results[0].value.remove).toHaveBeenCalled();
  expect(jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.results[0].value.remove).toHaveBeenCalled();
  expect(jest.mocked(Notifications.addPushTokenListener).mock.results[0].value.remove).toHaveBeenCalled();
  refresh.mockRestore();
});
it('unowned notification taps do not navigate', async () => {
  jest.mocked(NotificationApi.detail).mockRejectedValue(new Error('404'));
  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(response));
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('routes matching notification tap directly to /worker?requestId=...', async () => {
  useAuthStore.setState({ user: { id: 'w-1', roles: ['Worker'] } as AuthUser, isHydrated: true, isAuthenticated: true, isLoading: false, activeMode: 'Worker' });
  const matchingResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-match-1',
        content: {
          data: {
            notificationId: '22222222-2222-4222-8222-222222222222',
            eventType: 'matching.eligible_workers.ready',
            requestId: 'req-match-123',
            category: 'matching',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  jest.mocked(NotificationApi.detail).mockResolvedValueOnce({
    id: '22222222-2222-4222-8222-222222222222',
    category: 'matching',
    payload: {
      eventType: 'matching.eligible_workers.ready',
      requestId: 'req-match-123',
    },
  } as any);

  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(matchingResp));

  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/worker?requestId=req-match-123'));
});

it.each([false, true])('opens the invited request and switches to Worker mode when notification detail is unavailable: %s', async (offline) => {
  const requestId = '33333333-3333-4333-8333-333333333333';
  const payload = {
    eventType: 'quote_invitation.created',
    requestId,
    entityId: '44444444-4444-4444-8444-444444444444',
  };
  const record: NotificationRecord = {
    id: '55555555-5555-4555-8555-555555555555',
    category: 'request',
    title: 'Khách hàng muốn trao đổi',
    body: 'Bạn vừa nhận được lời mời báo giá.',
    payload,
    readAt: null,
    createdAt: '2026-11-25T03:00:00Z',
    updatedAt: '2026-11-25T03:00:00Z',
  };
  const invitationResponse = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-invitation-1',
        content: { data: { ...payload, notificationId: record.id, category: record.category } },
      },
    },
  } as unknown as NotificationResponse;
  useAuthStore.setState({ user: { id: 'worker-1', roles: ['Customer', 'Worker'] } as AuthUser, activeMode: 'Customer' });
  if (offline)
    jest.mocked(NotificationApi.detail).mockRejectedValueOnce(new Error('offline'));
  else
    jest.mocked(NotificationApi.detail).mockResolvedValueOnce(record);

  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(invitationResponse));

  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/worker?requestId=${requestId}`));
  expect(useAuthStore.getState().activeMode).toBe('Worker');
});
