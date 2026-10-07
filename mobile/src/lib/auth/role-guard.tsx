import { useRootNavigationState, useRouter } from 'expo-router';
import * as React from 'react';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

export type RoleGuardProps = {
  allowedRoles: string[];
  children: React.ReactNode;
};

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const user = useAuthStore.use.user();
  const isHydrated = useAuthStore.use.isHydrated();

  React.useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }

    if (!isHydrated)
      return;

    if (!isAuthenticated || !user) {
      router.replace(RouteNames.AUTH_LOGIN as any);
      return;
    }

    const hasAllowedRole = allowedRoles.some(role =>
      user.roles.includes(role),
    );

    if (!hasAllowedRole) {
      if (user.roles.includes('Worker')) {
        router.replace(RouteNames.WORKER_HOME as any);
      }
      else if (user.roles.includes('Customer')) {
        router.replace(RouteNames.CUSTOMER_HOME as any);
      }
      else {
        router.replace(RouteNames.ROOT as any);
      }
    }
  }, [rootNavigationState?.key, isAuthenticated, user, isHydrated, allowedRoles, router]);

  // While checking or unauthorized, prevent rendering protected children
  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const hasAllowedRole = allowedRoles.some(role => user.roles.includes(role));
  if (!hasAllowedRole) {
    return null;
  }

  return <>{children}</>;
}
