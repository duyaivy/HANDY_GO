/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { SparklesIcon, UserIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { setToken } from '@/lib/auth/utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { useAuthFlowStore } from '../use-auth-flow-store';

export function CompleteProfileScreen() {
  const router = useRouter();
  const guestRole = useAuthStore.use.guestRole();
  const setUser = useAuthStore.use.setUser();
  const setActiveMode = useAuthStore.use.setActiveMode();

  const flowPhone = useAuthFlowStore(state => state.phone);
  const flowCountryCode = useAuthFlowStore(state => state.countryCode);
  const resetFlow = useAuthFlowStore(state => state.resetFlow);

  const [fullName, setFullName] = React.useState('');
  const [referralCode, setReferralCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Determine role: prioritize guestRole from previous browsing context (Customer vs Worker)
  const assignedRole = guestRole === 'Worker' ? 'Worker' : 'Customer';

  const handleComplete = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError('Vui lòng nhập họ và tên');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Họ và tên phải có tối thiểu 2 ký tự');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Establish persistent local tokens for authenticated session
      await setToken({
        access: `handygo_jwt_${Date.now()}`,
        refresh: `handygo_rf_${Date.now()}`,
      });

      // 2. Set authenticated user in store with assigned role
      const phoneFormatted = flowPhone
        ? (flowPhone.startsWith('+') ? flowPhone : `${flowCountryCode}${flowPhone.replace(/^0/, '')}`)
        : '+84912345678';

      const userSession = {
        id: `user-${Date.now()}`,
        phone: phoneFormatted,
        email: null,
        roles: [assignedRole],
        permissions: ['profile:read', 'orders:create'],
      };

      setUser(userSession);
      setActiveMode(assignedRole);
      resetFlow();

      // 3. Route user directly into their corresponding app mode
      if (assignedRole === 'Worker') {
        router.replace(RouteNames.WORKER_HOME as any);
      }
      else {
        router.replace(RouteNames.CUSTOMER_HOME as any);
      }
    }
    catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi hoàn tất thông tin');
    }
    finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = React.useCallback(() => {
    if (router.canGoBack ? router.canGoBack() : true) {
      router.back();
    }
    else {
      router.replace(RouteNames.AUTH_LOGIN as any);
    }
  }, [router]);

  return (
    <Screen
      safeArea
      scrollable
      keyboardAware
      className="bg-neutral-50 dark:bg-neutral-950"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <AppBar
        mode="stack"
        title="Hoàn tất hồ sơ"
        onBack={handleBack}
        testID="complete-profile-app-bar"
      />

      <View testID="complete-profile-screen" className="flex-1 justify-between px-6 py-4">
        <View>
          {/* Header */}
          <View className="mb-6 items-center">
            <View className="mb-3 size-16 items-center justify-center rounded-3xl bg-amber-100 shadow-xs dark:bg-amber-950/40">
              <UserIcon size={32} color="#F5A524" />
            </View>
            <Text className="text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Thông tin tài khoản
            </Text>
            <Text className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Chỉ còn một bước nữa để hoàn tất đăng ký tài khoản HandyGo
            </Text>

            {/* Current Role Badge */}
            <View className="mt-3 flex-row items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 dark:border-amber-900 dark:bg-amber-950/30">
              <SparklesIcon size={14} color="#D97706" />
              <Text className="ml-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                Đăng ký tài khoản:
                {' '}
                {assignedRole === 'Worker' ? 'Đối tác Thợ' : 'Khách hàng'}
              </Text>
            </View>
          </View>

          {/* Form Card */}
          <View className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <Input
              testID="complete-profile-fullname-input"
              label="Họ và tên *"
              placeholder="Ví dụ: Nguyễn Văn A"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);
                if (error)
                  setError(null);
              }}
              error={error || undefined}
            />

            <View className="mt-3">
              <Input
                testID="complete-profile-referral-input"
                label="Mã giới thiệu (không bắt buộc)"
                placeholder="Nhập mã nếu được giới thiệu"
                value={referralCode}
                onChangeText={setReferralCode}
              />
            </View>
          </View>
        </View>

        {/* Footer Submit Button */}
        <View className="pt-6 pb-2">
          <Button
            testID="complete-profile-submit-btn"
            label="Hoàn tất →"
            variant="default"
            loading={isSubmitting}
            disabled={isSubmitting}
            className="h-12 w-full rounded-2xl bg-[#F5A524]"
            onPress={handleComplete}
          />
        </View>
      </View>
    </Screen>
  );
}
