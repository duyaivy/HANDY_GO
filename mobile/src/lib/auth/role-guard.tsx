/* eslint-disable max-lines-per-function */
import { useRootNavigationState, useRouter } from 'expo-router';
import * as React from 'react';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

export type RoleGuardProps = {
  allowedRoles: string[];
  children?: React.ReactNode;
  /** Cho phép khách vãng lai truy cập nếu đã chọn vai trò tương ứng */
  allowGuest?: boolean;
};

export function RoleGuard({ allowedRoles, children, allowGuest = false }: RoleGuardProps) {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const user = useAuthStore.use.user();
  const guestRole = useAuthStore.use.guestRole?.() ?? null;
  const isHydrated = useAuthStore.use.isHydrated();
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!rootNavigationState?.key) {
      return;
    }

    if (!isHydrated) {
      return;
    }

    const safeReplace = (target: string) => {
      if (!isMountedRef.current) {
        return;
      }
      try {
        router.replace(target as any);
      }
      catch {
        timer = setTimeout(() => safeReplace(target), 50);
      }
    };

    // Nếu người dùng chưa đăng nhập
    if (!isAuthenticated || !user) {
      if (allowGuest) {
        // Nếu cho phép khách nhưng khách chưa chọn vai trò -> chuyển đến trang Welcome
        if (!guestRole) {
          safeReplace(RouteNames.WELCOME);
          return;
        }

        // Nếu khách đã chọn vai trò nhưng vai trò không được phép truy cập
        if (!allowedRoles.includes(guestRole)) {
          if (guestRole === 'Worker') {
            safeReplace(RouteNames.WORKER_HOME);
          }
          else if (guestRole === 'Customer') {
            safeReplace(RouteNames.CUSTOMER_HOME);
          }
          else {
            safeReplace(RouteNames.WELCOME);
          }
          return;
        }

        // Khách hợp lệ với route này -> cho phép xem
        return;
      }

      // Không cho phép khách -> bắt buộc đăng nhập
      safeReplace(RouteNames.AUTH_LOGIN);
      return;
    }

    // Người dùng đã đăng nhập: kiểm tra vai trò tài khoản
    const hasAllowedRole = allowedRoles.some(role =>
      user.roles.includes(role),
    );

    if (!hasAllowedRole) {
      if (user.roles.includes('Worker')) {
        safeReplace(RouteNames.WORKER_HOME);
      }
      else if (user.roles.includes('Customer')) {
        safeReplace(RouteNames.CUSTOMER_HOME);
      }
      else {
        safeReplace(RouteNames.ROOT);
      }
    }
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    rootNavigationState?.key,
    isAuthenticated,
    user,
    isHydrated,
    allowedRoles,
    allowGuest,
    guestRole,
    router,
  ]);

  // Trong lúc đang hydrate dữ liệu
  if (!isHydrated) {
    return null;
  }

  // Trường hợp khách vãng lai
  if (!isAuthenticated || !user) {
    if (allowGuest && guestRole && allowedRoles.includes(guestRole)) {
      return children ? <>{children}</> : null;
    }
    return null;
  }

  // Trường hợp đã đăng nhập
  const hasAllowedRole = allowedRoles.some(role => user.roles.includes(role));
  if (!hasAllowedRole) {
    return null;
  }

  return children ? <>{children}</> : null;
}
