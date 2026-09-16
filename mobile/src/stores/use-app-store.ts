import { create } from 'zustand';
import { createSelectors } from '@/lib/utils';

type AppState = {
  isOnline: boolean;
  unreadNotificationsCount: number;
  activeOrderId: string | null;
  setIsOnline: (isOnline: boolean) => void;
  setUnreadNotificationsCount: (count: number) => void;
  setActiveOrderId: (id: string | null) => void;
};

const _useAppStore = create<AppState>(set => ({
  isOnline: true,
  unreadNotificationsCount: 0,
  activeOrderId: null,
  setIsOnline: isOnline => set({ isOnline }),
  setUnreadNotificationsCount: unreadNotificationsCount => set({ unreadNotificationsCount }),
  setActiveOrderId: activeOrderId => set({ activeOrderId }),
}));

export const useAppStore = createSelectors(_useAppStore);
