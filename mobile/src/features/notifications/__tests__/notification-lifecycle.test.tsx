import type { NotificationResponse } from 'expo-notifications';
import type { AuthUser } from '@/services/auth/auth-api';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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
