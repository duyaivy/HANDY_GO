import type { NotificationResponse } from 'expo-notifications';
import type { AuthUser } from '@/services/auth/auth-api';
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

it('routes service registration approval to /worker/skills and switches dual-role user to Worker', async () => {
  useAuthStore.setState({
    user: { id: 'dual-1', roles: ['Customer', 'Worker'] } as AuthUser,
    isHydrated: true,
    isAuthenticated: true,
    isLoading: false,
    activeMode: 'Customer',
  });

  const regResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-reg-1',
        content: {
          data: {
            notificationId: '33333333-3333-4333-8333-333333333333',
            eventType: 'worker.service_registration.approved',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  jest.mocked(NotificationApi.detail).mockResolvedValueOnce({
    id: '33333333-3333-4333-8333-333333333333',
    category: 'system',
    payload: {
      eventType: 'worker.service_registration.approved',
      registrationId: 'reg-approved-999',
    },
  } as any);

  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(regResp));

  await waitFor(() => {
    expect(useAuthStore.getState().activeMode).toBe('Worker');
  });
  expect(mockRouter.push).toHaveBeenCalledWith('/worker/skills');
});

it('falls back to customer inbox for generic system notification without switching mode', async () => {
  useAuthStore.setState({
    user: { id: 'dual-2', roles: ['Customer', 'Worker'] } as AuthUser,
    isHydrated: true,
    isAuthenticated: true,
    isLoading: false,
    activeMode: 'Customer',
  });

  const sysResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-sys-1',
        content: {
          data: {
            notificationId: '44444444-4444-4444-8444-444444444444',
            eventType: 'system.maintenance',
            category: 'system',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  jest.mocked(NotificationApi.detail).mockResolvedValueOnce({
    id: '44444444-4444-4444-8444-444444444444',
    category: 'system',
    payload: {
      eventType: 'system.maintenance',
    },
  } as any);

  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(sysResp));

  await waitFor(() => {
    // Must fall back to customer notifications inbox!
    expect(mockRouter.push).toHaveBeenCalledWith('/customer/(tabs)/notifications');
  });
  // Mode must NOT change to Worker!
  expect(useAuthStore.getState().activeMode).toBe('Customer');
});

it('routes OS tap for booking_proposal.created to /worker?requestId=... and booking_proposal.rejected to customer radar', async () => {
  useAuthStore.setState({
    user: { id: 'dual-prop', roles: ['Customer', 'Worker'] } as AuthUser,
    isHydrated: true,
    isAuthenticated: true,
    isLoading: false,
    activeMode: 'Customer',
  });

  const createdResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-prop-created',
        content: {
          data: {
            notificationId: '55555555-5555-4555-8555-555555555555',
            eventType: 'booking_proposal.created',
            category: 'proposal',
            requestId: 'req-os-1',
            recipientRole: 'worker',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  jest.mocked(NotificationApi.detail).mockResolvedValueOnce({
    id: '55555555-5555-4555-8555-555555555555',
    category: 'proposal',
    payload: {
      eventType: 'booking_proposal.created',
      requestId: 'req-os-1',
      recipientRole: 'worker',
    },
  } as any);

  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(createdResp));

  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/worker?requestId=req-os-1'));
  expect(useAuthStore.getState().activeMode).toBe('Worker');

  const rejectedResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-prop-rejected',
        content: {
          data: {
            notificationId: '66666666-6666-4666-8666-666666666666',
            eventType: 'booking_proposal.rejected',
            category: 'proposal',
            requestId: 'req-os-2',
            recipientRole: 'customer',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  jest.mocked(NotificationApi.detail).mockResolvedValueOnce({
    id: '66666666-6666-4666-8666-666666666666',
    category: 'proposal',
    payload: {
      eventType: 'booking_proposal.rejected',
      requestId: 'req-os-2',
      recipientRole: 'customer',
    },
  } as any);

  await act(async () => tapped(rejectedResp));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/customer/booking/radar?requestId=req-os-2'));
  expect(useAuthStore.getState().activeMode).toBe('Customer');
});

it.each([401, 403, 404])('does not navigate on %i error even when OS payload has domain route info', async (status) => {
  const fullPayloadResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: `push-auth-${status}`,
        content: {
          data: {
            notificationId: '77777777-7777-4777-8777-777777777777',
            eventType: 'order.created',
            category: 'order',
            orderId: 'order-secret-1',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  jest.mocked(NotificationApi.detail).mockRejectedValueOnce({ response: { status } });
  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(fullPayloadResp));

  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('does not navigate when detail request is aborted or account switches mid-flight', async () => {
  let rejectDetail!: (reason?: unknown) => void;
  jest.mocked(NotificationApi.detail).mockImplementationOnce((_id, signal) => new Promise((_resolve, reject) => {
    rejectDetail = reject;
    signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  }));

  const fullPayloadResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-abort-1',
        content: {
          data: {
            notificationId: '88888888-8888-4888-8888-888888888888',
            eventType: 'order.created',
            category: 'order',
            orderId: 'order-abort-1',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  const view = render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  act(() => tapped(fullPayloadResp));

  // Unmount aborts controller
  view.unmount();
  await act(async () => rejectDetail(new Error('Network Error')));
  expect(mockRouter.push).not.toHaveBeenCalled();

  // Account switch mid-flight prevents fallback navigation
  jest.mocked(NotificationApi.detail).mockImplementationOnce(() => new Promise((_resolve, reject) => {
    rejectDetail = reject;
  }));
  render(<NotificationLifecycle />);
  const tapped2 = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[1][0];
  act(() => tapped2({
    ...fullPayloadResp,
    notification: { ...fullPayloadResp.notification, request: { ...fullPayloadResp.notification.request, identifier: 'push-switch-2' } },
  } as unknown as NotificationResponse));
  act(() => useAuthStore.setState({ user: { id: 'user-b' } as AuthUser }));
  await act(async () => rejectDetail(new Error('Network Error')));
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('opens generic notification inbox (not domain route) when offline/network error occurs', async () => {
  const fullPayloadResp = {
    actionIdentifier: 'default',
    notification: {
      request: {
        identifier: 'push-offline-1',
        content: {
          data: {
            notificationId: '99999999-9999-4999-8999-999999999999',
            eventType: 'order.created',
            category: 'order',
            orderId: 'order-offline-1',
          },
        },
      },
    },
  } as unknown as NotificationResponse;

  jest.mocked(NotificationApi.detail).mockRejectedValueOnce(new Error('Network Error'));
  render(<NotificationLifecycle />);
  const tapped = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  await act(async () => tapped(fullPayloadResp));

  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/customer/(tabs)/notifications'));
  expect(mockRouter.push).not.toHaveBeenCalledWith('/customer/orders/order-offline-1');
});
