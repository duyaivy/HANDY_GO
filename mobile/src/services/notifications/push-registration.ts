import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Logger } from '@/services/logger/logger';
import { hydratePushRegistration, usePushRegistrationStore } from '@/stores/use-push-registration-store';
import { NotificationApi } from './notification-api';

// No read-device endpoint exists. A bounded lease reasserts the idempotent registration
// after backend resets / FCM deactivation without posting on every app launch.
export const REGISTRATION_LEASE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 60_000;
let work: Promise<void> | null = null;
let retryAfter = 0;
let epoch = 0;
let activeUser: string | null = null;
let suspended = false;
export function suspendPushRegistration(value: boolean) {
  suspended = value;
}
let controller: AbortController | null = null;
let latestDevice: { userId: string; id: string } | null = null;

export function nativePushSupported() {
  return Platform.OS === 'android' && Constants.appOwnership !== 'expo';
}
export function setPushUser(userId: string | null) {
  if (activeUser === userId)
    return;
  activeUser = userId;
  epoch++;
  retryAfter = 0;
  controller?.abort();
}

export async function syncPushRegistration(tokenOverride?: string, options?: { forcePrompt?: boolean }): Promise<void> {
  if (!activeUser || suspended || !nativePushSupported())
    return;
  if (work) {
    await work;
    // Token rotation must not be dropped behind an older registration.
    return syncPushRegistration(tokenOverride, options);
  }
  if (Date.now() < retryAfter && !options?.forcePrompt)
    return;
  const userId = activeUser;
  const generation = epoch;
  const current = () => activeUser === userId && epoch === generation && !suspended;
  work = (async () => {
    try {
      await hydratePushRegistration();
      if (!current())
        return;
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo HandyGo',
        importance: Notifications.AndroidImportance.HIGH,
      });
      if (!current())
        return;
      let permission = await Notifications.getPermissionsAsync();
      if (!current())
        return;
      const shouldPrompt = permission.canAskAgain && (
        options?.forcePrompt
          ? !permission.granted
          : (permission.status === 'undetermined' && !usePushRegistrationStore.getState().permissionAsked)
      );
      if (shouldPrompt) {
        usePushRegistrationStore.setState({ permissionAsked: true });
        permission = await Notifications.requestPermissionsAsync();
      }
      if (!current())
        return;
      if (!permission.granted) {
        const saved = usePushRegistrationStore.getState().registration;
        if (saved?.userId === userId) {
          controller = new AbortController();
          await NotificationApi.deactivate(saved.backendId, controller.signal);
          if (current())
            usePushRegistrationStore.setState({ registration: null });
        }
        return;
      }
      const token = tokenOverride ?? (await Notifications.getDevicePushTokenAsync()).data;
      if (!current() || typeof token !== 'string' || !token.trim())
        return;
      const store = usePushRegistrationStore.getState();
      const installationId = store.ensureInstallation();
      const saved = store.registration;
      if (saved?.userId === userId && saved.token === token && saved.installationId === installationId
        && saved.platform === 'android' && Date.now() >= saved.confirmedAt && Date.now() - saved.confirmedAt < REGISTRATION_LEASE_MS) {
        return;
      }
      controller = new AbortController();
      const device = await NotificationApi.register({ platform: 'android', deviceId: installationId, pushToken: token }, controller.signal);
      if (activeUser === userId && epoch === generation)
        latestDevice = { userId, id: device.id };
      if (!current())
        return;
      if (!device.isActive || device.platform !== 'android' || device.deviceId !== installationId || device.provider !== 'fcm')
        throw new Error('Inactive registration');
      usePushRegistrationStore.setState({ registration: {
        userId,
        token,
        installationId,
        platform: 'android',
        backendId: device.id,
        confirmedAt: Date.now(),
      } });
    }
    catch {
      if (current()) {
        retryAfter = Date.now() + RETRY_DELAY_MS;
        Logger.warn('PUSH_REGISTRATION', 'Push unavailable; retry on a later foreground or refresh.');
      }
    }
    finally { controller = null; }
  })();
  try {
    await work;
  }
  finally {
    work = null;
  }
}

export async function logoutPushRegistration(userId: string) {
  // Freeze new work while allowing a dispatched registration to return its device ID.
  // Authentication credentials remain available until this cleanup completes.
  suspended = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>((resolve) => {
    timer = setTimeout(resolve, 5500);
  })]);
  clearTimeout(timer);
  if (activeUser && activeUser !== userId)
    return;
  setPushUser(null);
  await hydratePushRegistration().catch(() => {});
  const saved = usePushRegistrationStore.getState().registration;
  const id = latestDevice?.userId === userId ? latestDevice.id : saved?.userId === userId ? saved.backendId : null;
  try {
    if (id)
      await NotificationApi.deactivate(id);
  }
  catch {
    Logger.warn('PUSH_LOGOUT', 'Device deactivation failed; backend registration may remain active.');
  }
  finally {
    if (latestDevice?.userId === userId)
      latestDevice = null;
    if (usePushRegistrationStore.getState().registration?.userId === userId) {
      usePushRegistrationStore.setState({ registration: null });
    }
  }
}
