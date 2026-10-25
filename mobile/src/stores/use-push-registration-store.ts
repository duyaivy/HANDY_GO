import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type PushRegistration = {
  userId: string;
  token: string;
  installationId: string;
  platform: 'android';
  backendId: string;
  confirmedAt: number;
};
type PushState = {
  installationId: string | null;
  registration: PushRegistration | null;
  permissionAsked: boolean;
  ensureInstallation: () => string;
};
export const usePushRegistrationStore = create<PushState>()(persist((set, get) => ({
  installationId: null,
  registration: null,
  permissionAsked: false,
  ensureInstallation: () => {
    const existing = get().installationId;
    if (existing)
      return existing;
    const id = randomUUID();
    set({ installationId: id });
    return id;
  },
}), {
  name: 'handygo-push-registration-v1',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: ({ installationId, registration, permissionAsked }) => ({ installationId, registration, permissionAsked }),
}));

export async function hydratePushRegistration() {
  if (!usePushRegistrationStore.persist.hasHydrated()) {
    await usePushRegistrationStore.persist.rehydrate();
  }
  if (!usePushRegistrationStore.persist.hasHydrated())
    throw new Error('Push storage unavailable');
}
