import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationApi } from '@/services/notifications/notification-api';
import { logoutPushRegistration, REGISTRATION_LEASE_MS, setPushUser, suspendPushRegistration, syncPushRegistration } from '@/services/notifications/push-registration';
import { hydratePushRegistration, usePushRegistrationStore } from '@/stores/use-push-registration-store';

jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: null } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'installation-1' }));
jest.mock('@/services/notifications/notification-api', () => ({ NotificationApi: { register: jest.fn(), deactivate: jest.fn() } }));
const register = jest.mocked(NotificationApi.register);
const deactivate = jest.mocked(NotificationApi.deactivate);
const permission = jest.mocked(Notifications.getPermissionsAsync);
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' } as Notifications.NotificationPermissionsStatus;
const device = { id: 'backend-device-1', isActive: true, deviceId: 'installation-1', provider: 'fcm', platform: 'android', createdAt: '', updatedAt: '', lastSeenAt: null } as const;

beforeEach(async () => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  setPushUser(null);
  suspendPushRegistration(false);
  await hydratePushRegistration();
  usePushRegistrationStore.setState({ installationId: null, registration: null, permissionAsked: false });
  register.mockResolvedValue(device);
  deactivate.mockResolvedValue({ id: device.id, isActive: false });
  permission.mockResolvedValue(granted);
  jest.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValue({ type: 'android', data: 'test-native-token' });
});
afterEach(() => setPushUser(null));

it('does nothing before authentication and on iOS', async () => {
  await syncPushRegistration();
  setPushUser('user-a');
  Object.defineProperty(Platform, 'OS', { value: 'ios' });
  await syncPushRegistration();
  expect(permission).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
});
it('requests undetermined permission once; persists successful native registration', async () => {
  permission.mockResolvedValueOnce({ ...granted, granted: false, status: 'undetermined' } as Notifications.NotificationPermissionsStatus);
  setPushUser('user-a');
  await syncPushRegistration();
  await syncPushRegistration();
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledWith({ platform: 'android', deviceId: 'installation-1', pushToken: 'test-native-token' }, expect.any(AbortSignal));
  expect(usePushRegistrationStore.getState().registration?.userId).toBe('user-a');
  expect(await AsyncStorage.getItem('handygo-push-registration-v1')).toContain('backend-device-1');
});
it('denied permission never prompts or registers', async () => {
  permission.mockResolvedValue({ ...granted, granted: false, status: 'denied' } as Notifications.NotificationPermissionsStatus);
  setPushUser('user-a');
  await syncPushRegistration();
  await syncPushRegistration();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
});
it('concurrent calls and restored state do not duplicate registration', async () => {
  setPushUser('user-a');
  await Promise.all([syncPushRegistration(), syncPushRegistration(), syncPushRegistration()]);
  await usePushRegistrationStore.persist.rehydrate();
  setPushUser(null);
  setPushUser('user-a');
  await syncPushRegistration();
  expect(register).toHaveBeenCalledTimes(1);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
it('rotates tokens and renews expired registration leases', async () => {
  setPushUser('user-a');
  await syncPushRegistration();
  await syncPushRegistration('rotated-token');
  expect(register).toHaveBeenCalledTimes(2);
  const saved = usePushRegistrationStore.getState().registration!;
  usePushRegistrationStore.setState({ registration: { ...saved, confirmedAt: Date.now() - REGISTRATION_LEASE_MS - 1 } });
  await syncPushRegistration('rotated-token');
  expect(register).toHaveBeenCalledTimes(3);
});
it('failure is not persisted and a controlled retry succeeds', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  register.mockRejectedValueOnce(new Error('503'));
  setPushUser('user-a');
  await syncPushRegistration();
  await syncPushRegistration();
  expect(register).toHaveBeenCalledTimes(1);
  expect(usePushRegistrationStore.getState().registration).toBeNull();
  now.mockReturnValue(62_000);
  await syncPushRegistration();
  expect(register).toHaveBeenCalledTimes(2);
  expect(usePushRegistrationStore.getState().registration?.backendId).toBe(device.id);
  now.mockRestore();
});
it('late permission result cannot register for a switched account', async () => {
  let resolve!: (value: Notifications.NotificationPermissionsStatus) => void;
  permission.mockImplementationOnce(() => new Promise((done) => {
    resolve = done;
  }));
  setPushUser('user-a');
  const pending = syncPushRegistration();
  // eslint-disable-next-line no-unmodified-loop-condition
  while (!resolve) await Promise.resolve();
  setPushUser('user-b');
  resolve(granted);
  await pending;
  expect(register).not.toHaveBeenCalled();
  await syncPushRegistration();
  expect(usePushRegistrationStore.getState().registration?.userId).toBe('user-b');
});
it('late registration success cannot persist under a different account', async () => {
  let resolve!: (value: typeof device) => void;
  register.mockImplementationOnce(() => new Promise((done) => {
    resolve = done;
  }));
  setPushUser('user-a');
  const pending = syncPushRegistration();
  // eslint-disable-next-line no-unmodified-loop-condition
  while (!resolve) await Promise.resolve();
  setPushUser('user-b');
  resolve(device);
  await pending;
  expect(usePushRegistrationStore.getState().registration).toBeNull();
});
it('logout deactivates before clearing ownership and preserves installation identity', async () => {
  setPushUser('user-a');
  await syncPushRegistration();
  await logoutPushRegistration('user-a');
  expect(deactivate).toHaveBeenCalledWith(device.id);
  expect(usePushRegistrationStore.getState().registration).toBeNull();
  expect(usePushRegistrationStore.getState().installationId).toBe('installation-1');
});
it('account ownership conflict is not recorded as success', async () => {
  setPushUser('user-a');
  await syncPushRegistration();
  await logoutPushRegistration('user-a');
  suspendPushRegistration(false);
  setPushUser('user-b');
  register.mockRejectedValueOnce(new Error('409'));
  await syncPushRegistration();
  expect(usePushRegistrationStore.getState().registration).toBeNull();
});
it('revoked permission deactivates a previously registered device', async () => {
  setPushUser('user-a');
  await syncPushRegistration();
  permission.mockResolvedValue({ ...granted, status: 'denied', granted: false } as Notifications.NotificationPermissionsStatus);
  await syncPushRegistration();
  expect(deactivate).toHaveBeenCalled();
  expect(usePushRegistrationStore.getState().registration).toBeNull();
});
