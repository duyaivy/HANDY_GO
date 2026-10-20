/* eslint-disable max-lines-per-function */
import type { AppMode } from '@/stores/use-auth-store';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

/* ── Inline SVG Icons for Welcome Screen ── */
function CustomerIcon({ color = PRIMARY_COLOR, size = 28 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

function WorkerIcon({ color = SECONDARY_COLOR, size = 28 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  );
}

function CheckmarkIcon({ color = '#FFFFFF', size = 12 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

function SelectionPill({ isSelected, color }: { isSelected: boolean; color: string }) {
  if (isSelected) {
    return (
      <View
        style={{ backgroundColor: color }}
        className="flex-row items-center rounded-full px-3 py-1 shadow-2xs"
      >
        <View className="mr-1.5 size-3.5 items-center justify-center rounded-full bg-white/30">
          <CheckmarkIcon color="#FFFFFF" size={9} />
        </View>
        <Text className="text-xs font-bold text-white">Đã chọn</Text>
      </View>
    );
  }
  return (
    <View
      style={{ borderColor: `${color}40` }}
      className="flex-row items-center rounded-full border bg-neutral-50 px-2.5 py-1 dark:bg-neutral-800"
    >
      <View
        style={{ borderColor: `${color}60` }}
        className="mr-1.5 size-3.5 rounded-full border"
      />
      <Text style={{ color }} className="text-xs font-semibold">
        Chạm để chọn
      </Text>
    </View>
  );
}

export function WelcomeScreen() {
  const router = useRouter();
  const setGuestRole = useAuthStore.use.setGuestRole();
  const currentGuestRole = useAuthStore.use.guestRole?.() ?? null;

  const [selectedRole, setSelectedRole] = React.useState<AppMode>(
    currentGuestRole || 'Customer',
  );

  const handleContinue = () => {
    setGuestRole(selectedRole);
    if (selectedRole === 'Customer') {
      router.replace(RouteNames.CUSTOMER_HOME as any);
    }
    else {
      router.replace(RouteNames.WORKER_HOME as any);
    }
  };

  const isCustomerSelected = selectedRole === 'Customer';
  const isWorkerSelected = selectedRole === 'Worker';

  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
        className="px-5 py-4"
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER (CENTERED WITH OFFICIAL LOGO) ── */}
        <View className="items-center pt-2">
          {/* Official App Logo */}
          <View className="mb-3 rounded-2xl bg-white p-1.5 shadow-xs dark:bg-neutral-900">
            <BrandLogo size={68} />
          </View>

          {/* Title & Slogan */}
          <Text className="text-center text-2xl/tight font-black text-neutral-900 dark:text-white">
            Bạn là Khách hàng hay Thợ sửa chữa?
          </Text>
          <Text className="mt-1.5 text-center text-xs/relaxed text-neutral-500 dark:text-neutral-400">
            Vui lòng chọn vai trò phù hợp để bắt đầu trải nghiệm cùng HandyGo
          </Text>
        </View>

        {/* ── ROLE SELECTION CARDS ── */}
        <View className="my-5 space-y-4">
          {/* ── Card 1: KHÁCH HÀNG ── */}
          <Pressable
            testID="welcome-customer-card"
            onPress={() => setSelectedRole('Customer')}
            accessibilityRole="button"
            accessibilityLabel="Chọn vai trò Khách hàng"
            style={{
              borderColor: isCustomerSelected ? PRIMARY_COLOR : '#E5E7EB',
              borderWidth: 2,
            }}
            className={`rounded-3xl p-5 shadow-xs transition-all ${
              isCustomerSelected
                ? 'bg-amber-500/6 dark:bg-amber-500/15'
                : 'bg-white dark:border-neutral-800 dark:bg-neutral-900'
            }`}
          >
            {/* Top row: Icon + Role Info + Selection Pill */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center space-x-3">
                <View
                  style={{ backgroundColor: isCustomerSelected ? PRIMARY_COLOR : '#FEF3C7' }}
                  className="size-12 items-center justify-center rounded-2xl shadow-2xs"
                >
                  <CustomerIcon color={isCustomerSelected ? '#FFFFFF' : '#D97706'} size={24} />
                </View>
                <View>
                  <Text className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                    Khách hàng
                  </Text>
                  <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Tìm kiếm & đặt lịch thợ
                  </Text>
                </View>
              </View>

              <SelectionPill isSelected={isCustomerSelected} color={PRIMARY_COLOR} />
            </View>

            {/* Feature Highlights */}
            <View className="mt-3.5 border-t border-neutral-100 pt-3 dark:border-neutral-800/80">
              <View className="space-y-1.5">
                <View className="flex-row items-center">
                  <Text className="mr-2 text-xs font-bold text-amber-500">✓</Text>
                  <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                    Đặt lịch sửa điện nước, điện lạnh, gia dụng nhanh chóng
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="mr-2 text-xs font-bold text-amber-500">✓</Text>
                  <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                    Báo giá minh bạch từ nhiều thợ uy tín quanh khu vực
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="mr-2 text-xs font-bold text-amber-500">✓</Text>
                  <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                    An tâm dịch vụ với chính sách bảo hành rõ ràng
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>

          {/* ── Card 2: ĐỐI TÁC THỢ ── */}
          <Pressable
            testID="welcome-worker-card"
            onPress={() => setSelectedRole('Worker')}
            accessibilityRole="button"
            accessibilityLabel="Chọn vai trò Đối tác Thợ"
            style={{
              borderColor: isWorkerSelected ? SECONDARY_COLOR : '#E5E7EB',
              borderWidth: 2,
            }}
            className={`rounded-3xl p-5 shadow-xs transition-all ${
              isWorkerSelected
                ? 'bg-blue-600/6 dark:bg-blue-600/15'
                : 'bg-white dark:border-neutral-800 dark:bg-neutral-900'
            }`}
          >
            {/* Top row: Icon + Role Info + Selection Pill */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center space-x-3">
                <View
                  style={{ backgroundColor: isWorkerSelected ? SECONDARY_COLOR : '#DBEAFE' }}
                  className="size-12 items-center justify-center rounded-2xl shadow-2xs"
                >
                  <WorkerIcon color={isWorkerSelected ? '#FFFFFF' : SECONDARY_COLOR} size={24} />
                </View>
                <View>
                  <Text className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                    Đối tác Thợ
                  </Text>
                  <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Nhận việc & gia tăng thu nhập
                  </Text>
                </View>
              </View>

              <SelectionPill isSelected={isWorkerSelected} color={SECONDARY_COLOR} />
            </View>

            {/* Feature Highlights */}
            <View className="mt-3.5 border-t border-neutral-100 pt-3 dark:border-neutral-800/80">
              <View className="space-y-1.5">
                <View className="flex-row items-center">
                  <Text className="mr-2 text-xs font-bold text-blue-500">✓</Text>
                  <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                    Bảng tin đơn việc mới phát liên tục theo bán kính gần bạn
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="mr-2 text-xs font-bold text-blue-500">✓</Text>
                  <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                    Chủ động nhận việc, báo giá và thương lượng trực tiếp
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="mr-2 text-xs font-bold text-blue-500">✓</Text>
                  <Text className="text-xs text-neutral-600 dark:text-neutral-300">
                    Quản lý thu nhập minh bạch và rút tiền ví linh hoạt
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        </View>

        {/* ── FOOTER ACTIONS ── */}
        <View className="mt-auto mb-2 space-y-3">
          <Button
            testID="welcome-submit-btn"
            label="Tiếp tục trải nghiệm  →"
            variant="default"
            onPress={handleContinue}
            style={{
              backgroundColor: isCustomerSelected ? PRIMARY_COLOR : SECONDARY_COLOR,
            }}
            className="h-13 w-full rounded-2xl shadow-xs"
          />

          <View className="flex-row items-center justify-center pt-0.5">
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">
              Đã có tài khoản?
            </Text>
            <Pressable
              testID="welcome-login-link"
              onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
              accessibilityRole="button"
              accessibilityLabel="Đăng nhập ngay"
              className="ml-1"
            >
              <Text
                style={{ color: isCustomerSelected ? PRIMARY_COLOR : SECONDARY_COLOR }}
                className="text-xs font-bold underline"
              >
                Đăng nhập ngay
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
