import type { AppMode } from '@/stores/use-auth-store';
import { create } from 'zustand';

export const WATCHDOG_TIMEOUT_MS = 10000;

let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

function clearWatchdogTimer() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

export type ModeSwitchStoreState = {
  isSwitching: boolean;
  targetMode: AppMode | null;
  previousMode: AppMode | null;
  isTimedOut: boolean;
  errorMessage: string | null;
  startSwitch: (target: AppMode, previous?: AppMode | null) => void;
  finishSwitch: () => void;
  triggerTimeout: () => void;
  cancelSwitch: () => void;
  reset: () => void;
};

export const useModeSwitchStore = create<ModeSwitchStoreState>((set, get) => ({
  isSwitching: false,
  targetMode: null,
  previousMode: null,
  isTimedOut: false,
  errorMessage: null,

  startSwitch: (target: AppMode, previous?: AppMode | null) => {
    clearWatchdogTimer();
    set({
      isSwitching: true,
      targetMode: target,
      previousMode: previous ?? null,
      isTimedOut: false,
      errorMessage: null,
    });

    watchdogTimer = setTimeout(() => {
      get().triggerTimeout();
    }, WATCHDOG_TIMEOUT_MS);
  },

  finishSwitch: () => {
    clearWatchdogTimer();
    set({
      isSwitching: false,
      targetMode: null,
      previousMode: null,
      isTimedOut: false,
      errorMessage: null,
    });
  },

  triggerTimeout: () => {
    clearWatchdogTimer();
    if (get().isSwitching) {
      set({
        isTimedOut: true,
        errorMessage: 'Không thể chuyển ứng dụng vào lúc này. Vui lòng thử lại.',
      });
    }
  },

  cancelSwitch: () => {
    clearWatchdogTimer();
    set({
      isSwitching: false,
      targetMode: null,
      previousMode: null,
      isTimedOut: false,
      errorMessage: null,
    });
  },

  reset: () => {
    clearWatchdogTimer();
    set({
      isSwitching: false,
      targetMode: null,
      previousMode: null,
      isTimedOut: false,
      errorMessage: null,
    });
  },
}));
