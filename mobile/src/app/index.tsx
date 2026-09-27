/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { getDestinationByRoles } from '@/lib/auth/navigation';
import { useAuthStore } from '@/stores/use-auth-store';

export default function IndexScreen() {
  const router = useRouter();
  const isHydrated = useAuthStore.use.isHydrated();
  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const user = useAuthStore.use.user();
  const hydrationError = useAuthStore.use.hydrationError();
  const hydrate = useAuthStore.use.hydrate();
  const logout = useAuthStore.use.logout();

  const destination = React.useMemo(() => {
    if (!isAuthenticated || !user) {
      return { type: 'UNAUTHENTICATED' as const };
    }
    return getDestinationByRoles(user.roles);
  }, [isAuthenticated, user]);

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (hydrationError) {
      return;
    }

    if (destination.type === 'ROUTE') {
      router.replace(destination.path as any);
    }
    else if (destination.type === 'UNAUTHENTICATED') {
      router.replace(RouteNames.AUTH_LOGIN as any);
    }
  }, [isHydrated, hydrationError, destination, router]);

  // If session couldn't be verified due to network outage, offer Retry or Go to Login
  if (isHydrated && hydrationError) {
    return (
      <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
        <View testID="session-network-error" className="flex-1 items-center justify-center px-6">
          <View className="mb-4 size-16 items-center justify-center rounded-2xl bg-amber-500/10">
            <Text className="text-3xl">📡</Text>
          </View>
          <Text className="text-center text-xl font-bold text-neutral-900 dark:text-white">
            Không thể kết nối máy chủ
          </Text>
          <Text className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
            Không thể xác minh phiên đăng nhập của bạn lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.
          </Text>

          <View className="mt-8 w-full max-w-xs space-y-3">
            <Button
              testID="retry-hydration-btn"
              label="Thử lại kết nối"
              variant="default"
              onPress={() => hydrate()}
            />
            <Button
              testID="goto-login-btn"
              label="Đến trang Đăng nhập"
              variant="outline"
              onPress={async () => {
                await logout();
                router.replace(RouteNames.AUTH_LOGIN as any);
              }}
            />
          </View>
        </View>
      </Screen>
    );
  }

  // Admin-only unsupported screen
  if (isHydrated && destination.type === 'ADMIN_UNSUPPORTED') {
    return (
      <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
        <View testID="admin-unsupported-screen" className="flex-1 items-center justify-center px-6">
          <View className="mb-4 size-16 items-center justify-center rounded-2xl bg-red-500/10">
            <Text className="text-3xl">🛡️</Text>
          </View>
          <Text className="text-center text-xl font-bold text-neutral-900 dark:text-white">
            Tài khoản Quản trị viên (Admin)
          </Text>
          <Text className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
            Ứng dụng di động hiện chỉ hỗ trợ Khách hàng và Đối tác Thợ. Vui lòng sử dụng Web Portal để quản trị hệ thống.
          </Text>

          <View className="mt-8 w-full max-w-xs">
            <Button
              testID="admin-logout-btn"
              label="Đăng xuất"
              variant="default"
              onPress={async () => {
                await logout();
                router.replace(RouteNames.AUTH_LOGIN as any);
              }}
            />
          </View>
        </View>
      </Screen>
    );
  }

  // Loading state while hydrating
  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="session-loading-screen" className="flex-1 items-center justify-center px-6">
        <View className="mb-6">
          <BrandLogo size={96} />
        </View>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Đang khôi phục phiên đăng nhập...
        </Text>
      </View>
    </Screen>
  );
}
