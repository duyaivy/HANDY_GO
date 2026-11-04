import type { AppMode } from '@/stores/use-auth-store';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';
import { useModeSwitchStore } from '../stores/use-mode-switch-store';

export function useAppModeSwitch() {
  const router = useRouter();
  const isSwitching = useModeSwitchStore(state => state.isSwitching);
  const targetMode = useModeSwitchStore(state => state.targetMode);
  const isTimedOut = useModeSwitchStore(state => state.isTimedOut);
  const errorMessage = useModeSwitchStore(state => state.errorMessage);

  const switchToMode = React.useCallback(
    (target: AppMode) => {
      // 1. Chặn click liên tục (Spam click prevention)
      if (useModeSwitchStore.getState().isSwitching) {
        return;
      }

      const { activeMode, isAuthenticated, user } = useAuthStore.getState();

      // 2. Kiểm tra quyền tài khoản
      if (isAuthenticated && user) {
        if (target === 'Worker' && !user.roles?.includes('Worker')) {
          router.push(RouteNames.CUSTOMER_SWITCH_TO_WORKER as any);
          return;
        }
      }

      // 3. Kích hoạt Root Overlay Loading và Watchdog 10s
      useModeSwitchStore.getState().startSwitch(target, activeMode);

      // 4. Cập nhật activeMode / guestRole
      if (isAuthenticated && user) {
        useAuthStore.getState().setActiveMode(target);
      }
      else {
        useAuthStore.getState().setGuestRole(target);
        useAuthStore.getState().setActiveMode(target);
      }

      // 5. Điều hướng ĐÚNG MỘT LẦN duy nhất
      const destination = target === 'Worker' ? RouteNames.WORKER_HOME : RouteNames.CUSTOMER_HOME;
      router.replace(destination as any);
    },
    [router],
  );

  const retrySwitch = React.useCallback(() => {
    const currentTarget = useModeSwitchStore.getState().targetMode;
    if (currentTarget) {
      useModeSwitchStore.getState().reset();
      switchToMode(currentTarget);
    }
  }, [switchToMode]);

  const revertSwitch = React.useCallback(() => {
    const prev = useModeSwitchStore.getState().previousMode;
    if (prev) {
      const { isAuthenticated, user } = useAuthStore.getState();
      if (isAuthenticated && user) {
        useAuthStore.getState().setActiveMode(prev);
      }
      else {
        useAuthStore.getState().setGuestRole(prev);
        useAuthStore.getState().setActiveMode(prev);
      }
      const destination = prev === 'Worker' ? RouteNames.WORKER_HOME : RouteNames.CUSTOMER_HOME;
      router.replace(destination as any);
    }
    useModeSwitchStore.getState().cancelSwitch();
  }, [router]);

  const finishSwitch = React.useCallback(() => {
    useModeSwitchStore.getState().finishSwitch();
  }, []);

  return {
    errorMessage,
    finishSwitch,
    isSwitching,
    isTimedOut,
    retrySwitch,
    revertSwitch,
    switchToMode,
    targetMode,
  };
}
