/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from '@/components/ui';
import { ClockIcon, ShieldCheckIcon, SparklesIcon } from '@/components/ui/icons';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

/* ── Inline Icons for Popular Services ── */
function AcServiceIcon() {
  return (
    <View className="size-12 items-center justify-center rounded-2xl bg-sky-100 dark:bg-sky-950/50">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Rect x="2" y="4" width="20" height="12" rx="2" />
        <Path d="M6 12h12" />
        <Path d="M8 8h8" />
        <Path d="m7 20 2-4" />
        <Path d="m17 20-2-4" />
      </Svg>
    </View>
  );
}

function PlumbingIcon() {
  return (
    <View className="size-12 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/50">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 2v6" />
        <Path d="M8 4h8" />
        <Path d="M5 8h14a2 2 0 0 1 2 2v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2z" />
        <Path d="M12 18v4" />
      </Svg>
    </View>
  );
}

function ElectricalIcon() {
  return (
    <View className="size-12 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/50">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="m13 2-8 12h7l-1 8 8-12h-7l1-8z" />
      </Svg>
    </View>
  );
}

function ApplianceIcon() {
  return (
    <View className="size-12 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/50">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Rect x="4" y="2" width="16" height="20" rx="2" />
        <Circle cx="12" cy="14" r="4" />
        <Path d="M8 6h.01" />
        <Path d="M12 6h.01" />
        <Path d="M16 6h.01" />
      </Svg>
    </View>
  );
}

function DrainIcon() {
  return (
    <View className="size-12 items-center justify-center rounded-2xl bg-teal-100 dark:bg-teal-950/50">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 2v20" />
        <Path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </Svg>
    </View>
  );
}

function WaterproofIcon() {
  return (
    <View className="size-12 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-950/50">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </Svg>
    </View>
  );
}

function LocksmithIcon() {
  return (
    <View className="size-12 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950/50">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="8" cy="15" r="4" />
        <Path d="M10.85 12.15 19 4" />
        <Path d="m18 5 2 2" />
        <Path d="m15 8 2 2" />
      </Svg>
    </View>
  );
}

const POPULAR_SERVICES = [
  { id: 'srv-ac', title: 'Sửa máy lạnh', icon: AcServiceIcon },
  { id: 'srv-plumb', title: 'Thợ ống nước', icon: PlumbingIcon },
  { id: 'srv-ac-mnt', title: 'Bảo dưỡng AC', icon: AcServiceIcon },
  { id: 'srv-electric', title: 'Thợ sửa điện', icon: ElectricalIcon },
  { id: 'srv-appliance', title: 'Sửa gia dụng', icon: ApplianceIcon },
  { id: 'srv-drain', title: 'Thông cống', icon: DrainIcon },
  { id: 'srv-waterproof', title: 'Chống thấm', icon: WaterproofIcon },
  { id: 'srv-lock', title: 'Sửa khóa cửa', icon: LocksmithIcon },
];

export function CustomerGuestOverview() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSwitchToWorker = () => {
    useAuthStore.getState().setGuestRole('Worker');
    router.replace(RouteNames.WORKER_HOME as any);
  };

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push({
        pathname: '/customer/category' as never,
        params: { q: trimmed },
      });
    }
    else {
      router.push('/customer/category' as never);
    }
  };

  return (
    <View testID="customer-guest-overview-screen" className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View className="flex-row items-center justify-between pt-3 pb-2">
          <Text className="text-3xl font-black text-neutral-900 dark:text-white">
            Tổng quan
          </Text>

          {/* Role Switch Chip */}
          <Pressable
            testID="customer-guest-role-switch-chip"
            onPress={handleSwitchToWorker}
            accessibilityRole="button"
            accessibilityLabel="Đổi sang App Thợ"
            className="flex-row items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 shadow-2xs active:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40"
          >
            <View className="mr-1.5 size-2 rounded-full bg-[#F5A524]" />
            <Text className="text-xs font-bold text-amber-800 dark:text-amber-300">
              App Thợ ⇄
            </Text>
          </Pressable>
        </View>

        {/* ── SEARCH BAR ── */}
        <View className="mt-2 flex-row items-center rounded-2xl border border-neutral-200 bg-white px-3.5 py-1.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <TextInput
            testID="customer-guest-search-input"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            placeholder="Tìm thợ sửa máy lạnh, điện nước, đồ gia dụng..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-sm text-neutral-900 dark:text-white"
          />
          <Pressable
            onPress={handleSearch}
            className="size-9 items-center justify-center rounded-xl bg-[#F5A524] shadow-xs active:bg-primary-600"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx="11" cy="11" r="8" />
              <Path d="m21 21-4.3-4.3" />
            </Svg>
          </Pressable>
        </View>

        {/* ── REGISTRATION CTA CARD ── */}
        <View className="mt-4 flex-row items-center justify-between rounded-3xl border border-neutral-200 bg-white p-4.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-neutral-900 dark:text-white">
              Bạn chưa có tài khoản HandyGo?
            </Text>
            <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Đăng ký ngay để tìm kiếm thợ uy tín và nhận ưu đãi đặt dịch vụ.
            </Text>
            <Pressable
              testID="customer-guest-start-btn"
              onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
              className="mt-3.5 flex-row items-center self-start rounded-full bg-[#F5A524] px-4 py-2 shadow-xs active:bg-amber-600"
            >
              <Text className="mr-1 text-xs font-bold text-neutral-900">Bắt đầu</Text>
              <Text className="text-xs font-bold text-neutral-900">→</Text>
            </Pressable>
          </View>

          {/* Right Avatar/Illustration */}
          <View className="size-20 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/40">
            <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <Circle cx="9" cy="7" r="4" />
              <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </Svg>
          </View>
        </View>

        {/* ── POPULAR SERVICES SECTION ── */}
        <View className="mt-6">
          <View className="mb-3 flex-row items-center">
            <SparklesIcon size={18} color="#D97706" />
            <Text className="ml-1.5 text-base font-bold text-neutral-900 dark:text-white">
              Dịch vụ phổ biến
            </Text>
          </View>

          <View className="flex-row flex-wrap justify-between gap-y-4">
            {POPULAR_SERVICES.map((srv) => {
              const IconComponent = srv.icon;
              return (
                <Pressable
                  key={srv.id}
                  testID={`popular-service-${srv.id}`}
                  onPress={() => router.push(RouteNames.CUSTOMER_CATEGORY as any)}
                  className="w-[23%] items-center active:opacity-75"
                >
                  <IconComponent />
                  <Text
                    numberOfLines={2}
                    className="mt-1.5 text-center text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                  >
                    {srv.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Pagination Dots */}
          <View className="mt-3 flex-row justify-center space-x-1.5">
            <View className="h-1.5 w-6 rounded-full bg-[#F5A524]" />
            <View className="h-1.5 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <View className="h-1.5 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
          </View>
        </View>

        {/* ── PROMOTIONAL BANNER CARD (Ảnh 2) ── */}
        <View className="mt-6 overflow-hidden rounded-3xl border border-amber-200 bg-linear-to-r from-amber-500 to-orange-600 p-5 shadow-sm dark:border-amber-900">
          <View className="flex-row items-center justify-between">
            <View className="rounded-full bg-white/20 px-2.5 py-0.5">
              <Text className="text-[10px] font-extrabold tracking-wider text-white">
                HANDYGO DỊCH VỤ
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-white/90">
              Cam kết chất lượng
            </Text>
          </View>

          <Text className="mt-2 text-xl font-black text-white">
            100.000+ Thợ trên toàn quốc
          </Text>
          <Text className="mt-1 text-xs text-amber-100">
            Có mặt sau 10 - 15 phút • Tặng kèm bảo hành 30 ngày cho mọi đơn đặt.
          </Text>

          <View className="mt-3.5 flex-row space-x-3">
            <View className="flex-row items-center">
              <ShieldCheckIcon size={14} color="#FDE68A" />
              <Text className="ml-1 text-[10px] font-bold text-white">Thợ đã xác thực</Text>
            </View>
            <View className="flex-row items-center">
              <ClockIcon size={14} color="#FDE68A" />
              <Text className="ml-1 text-[10px] font-bold text-white">Báo giá minh bạch</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── STICKY BOTTOM BUTTON ── */}
      <View className="absolute right-0 bottom-0 left-0 border-t border-neutral-100 bg-white/95 p-4 shadow-lg backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95">
        <Pressable
          testID="customer-guest-cta-bottom"
          onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
          accessibilityRole="button"
          accessibilityLabel="Bắt đầu ngay"
          className="h-12 w-full flex-row items-center justify-center rounded-full bg-[#F5A524] shadow-md shadow-amber-500/20 active:bg-amber-600"
        >
          <Text className="text-base font-bold text-neutral-900">
            Bắt đầu ngay
          </Text>
          <Text className="ml-2 text-base font-bold text-neutral-900">
            →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
