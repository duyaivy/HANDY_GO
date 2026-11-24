import type { NotificationResponse } from 'expo-notifications';
import type { Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ordersQueryKeys } from '@/features/orders/hooks/orders-query-keys';
import { queryClient } from '@/lib/api/query-client';
import { setNotificationLogoutHook } from '@/services/notifications/logout-hook';
import { NotificationApi } from '@/services/notifications/notification-api';
import { logoutPushRegistration, nativePushSupported, setPushUser, suspendPushRegistration, syncPushRegistration } from '@/services/notifications/push-registration';
import { useAuthStore } from '@/stores/use-auth-store';
import { usePushRegistrationStore } from '@/stores/use-push-registration-store';
import { notificationKeys, refreshNotifications, useNotificationUserId } from './hooks/use-notifications';
import { notificationIdFromData } from './notification-payload';
import { getFallbackNotificationRoute, resolveNotificationDeepLink } from './notification-routing';

function sessionUser() {
  const state = useAuthStore.getState();
  return state.isHydrated && state.isAuthenticated ? state.user?.id ?? null : null;
}

// Root subscriptions and their symmetric cleanup belong to one effect.

export function NotificationLifecycle() {
  const router = useRouter();
  const navigation = useRootNavigationState();
  const [pending, setPending] = useState<NotificationResponse | null>(null);
  const handled = useRef(new Set<string>());
  const userId = useNotificationUserId();

  useEffect(() => {
    if (!navigation?.key || !userId || !pending)
      return;
    const id = notificationIdFromData(pending.notification.request.content.data);
    if (!id)
      return;

    const pendingData = pending.notification.request.content.data as Record<string, unknown> | undefined;
    const fallbackEventType = String(pendingData?.eventType || pendingData?.type || '');
    const fallbackRequestId = String(pendingData?.requestId || pendingData?.serviceRequestId || pendingData?.entityId || '');
    const fallbackOrderId = String(pendingData?.orderId || pendingData?.entityId || '');
    const fallbackCategory = String(pendingData?.category || '');

    const handleDeepLink = (
      eventType: string,
      requestId: string,
      details?: { category?: string; conversationId?: string; orderId?: string },
    ) => {
      try {
        const { category, conversationId, orderId } = details ?? {};
        const mode = useAuthStore.getState().activeMode;
        const userRoles = useAuthStore.getState().user?.roles || [];

        const target = resolveNotificationDeepLink({
          eventType,
          category,
          requestId,
          orderId,
          conversationId,
          userRoles,
          activeMode: mode,
        });

        if (target) {
          if (target.targetMode && target.targetMode !== mode) {
            useAuthStore.getState().setActiveMode(target.targetMode);
          }
          router.push(target.route as Href);
        }
        else {
          router.push(getFallbackNotificationRoute(mode) as Href);
        }
      }
      catch (navErr) {
        console.warn('[NOTIF_DEEP_LINK] Navigation error:', navErr);
      }
    };

    const controller = new AbortController();
    // Verify ownership before using an OS tray payload (which may predate login).
    NotificationApi.detail(id, controller.signal).then((record) => {
      if (controller.signal.aborted || sessionUser() !== userId)
        return;

      const eventType = String(record?.payload?.eventType || fallbackEventType);
      const requestId = String(record?.payload?.requestId || record?.payload?.serviceRequestId || record?.payload?.entityId || fallbackRequestId);
      const category = String(record?.category || fallbackCategory);
      const orderId = String(record?.payload?.orderId || record?.payload?.entityId || fallbackOrderId);

      handleDeepLink(eventType, requestId, {
        category,
        conversationId: String(record?.payload?.conversationId || ''),
        orderId,
      });
      void refreshNotifications(userId);
    }).catch((_err) => {
      // Safe fallback for cold-start or offline/failed detail fetch: navigate using notification payload
      if (sessionUser() === userId && (fallbackEventType || fallbackRequestId || fallbackOrderId)) {
        handleDeepLink(fallbackEventType, fallbackRequestId, {
          category: fallbackCategory,
          orderId: fallbackOrderId,
        });
      }
    }).finally(() => {
      if (!controller.signal.aborted)
        setPending(null);
    });
    return () => controller.abort();
  }, [navigation?.key, userId, pending, router]);

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      if (useAuthStore.getState().isLoading)
        return;
      const id = sessionUser();
      if (id) {
        void refreshNotifications(id);
        void syncPushRegistration();
      }
    };
    setPushUser(sessionUser());
    suspendPushRegistration(useAuthStore.getState().isLoading);
    setNotificationLogoutHook(logoutPushRegistration);
    void syncPushRegistration();
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      suspendPushRegistration(state.isLoading);
      const nextId = sessionUser();
      setPushUser(nextId);
      if (previous.user?.id && previous.user.id !== nextId) {
        setPending(null);
        const queryKey = notificationKeys.user(previous.user.id);
        void queryClient.cancelQueries({ queryKey });
        queryClient.removeQueries({ queryKey });
        void queryClient.cancelQueries({ queryKey: ['worker-my-service-registrations'] });
        queryClient.removeQueries({ queryKey: ['worker-my-service-registrations'] });
        void queryClient.cancelQueries({ queryKey: ['worker-skills-orders'] });
        queryClient.removeQueries({ queryKey: ['worker-skills-orders'] });
        void queryClient.cancelQueries({ queryKey: ['worker-public-profile-services'] });
        queryClient.removeQueries({ queryKey: ['worker-public-profile-services'] });
        usePushRegistrationStore.setState({ registration: null });
      }
      if (nextId && !state.isLoading) {
        const isLogin = !previous.isAuthenticated && state.isAuthenticated;
        void syncPushRegistration(undefined, { forcePrompt: isLogin });
      }
    });
    const appState = AppState.addEventListener('change', (value) => {
      if (value === 'active')
        sync();
    });
    const subscriptions: { remove: () => void }[] = [];
    if (nativePushSupported()) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: Boolean(sessionUser()),
          shouldShowList: Boolean(sessionUser()),
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      const handleResponse = (response: NotificationResponse) => {
        if (!mounted)
          return;
        const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
        if (handled.current.has(key))
          return;
        handled.current.add(key);
        if (handled.current.size > 100)
          handled.current.delete(handled.current.values().next().value!);
        void Notifications.clearLastNotificationResponseAsync().catch(() => {});
        if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
          && notificationIdFromData(response.notification.request.content.data)) {
          setPending(response);
        }
      };
      subscriptions.push(Notifications.addNotificationReceivedListener(() => {
        const id = sessionUser();
        if (id) {
          void refreshNotifications(id);
          void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
          void queryClient.invalidateQueries({ queryKey: ['chat', id, 'list'] });
          void queryClient.invalidateQueries({ queryKey: ['worker-my-service-registrations'] });
          void queryClient.invalidateQueries({ queryKey: ['worker-public-profile-services'] });
        }
      }));
      subscriptions.push(Notifications.addNotificationResponseReceivedListener(handleResponse));
      subscriptions.push(Notifications.addPushTokenListener((token) => {
        if (token.type === 'android' && typeof token.data === 'string')
          void syncPushRegistration(token.data);
      }));
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response)
          handleResponse(response);
      }).catch(() => {});
    }
    return () => {
      mounted = false;
      unsubscribe();
      appState.remove();
      subscriptions.forEach(subscription => subscription.remove());
      setNotificationLogoutHook(undefined);
      setPushUser(null);
      if (nativePushSupported())
        Notifications.setNotificationHandler(null);
    };
  }, []);
  return null;
}
