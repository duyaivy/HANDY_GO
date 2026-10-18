import * as React from 'react';
import { Pressable, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from '@/components/ui';

// ─── Utility Vector Icons ─────────────────────────────────────────────────────
function HistoryTicketIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5V19L6.5 17.5L9 19L11.5 17.5L14 19L16.5 17.5L19 19L21.5 17.5V5L19 6.5L16.5 5L14 6.5L11.5 5L9 6.5L6.5 5L4 6.5V5Z"
        fill="#FFEDD5"
        stroke="#EA580C"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8 10H16" stroke="#EA580C" strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M8 14H13" stroke="#EA580C" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function FavoriteHeartIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#EF4444">
      <Path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z" />
    </Svg>
  );
}

function ReferralGiftIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12V21H4V12" stroke="#D97706" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M22 7H2V12H22V7Z" fill="#FEF3C7" stroke="#D97706" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 21V7" stroke="#D97706" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7H7.5C6.12 7 5 5.88 5 4.5C5 3.12 6.12 2 7.5 2C10.5 2 12 7 12 7Z" stroke="#D97706" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7H16.5C17.88 7 19 5.88 19 4.5C19 3.12 17.88 2 16.5 2C13.5 2 12 7 12 7Z" stroke="#D97706" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SupportHeadsetIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M3 18V13C3 8.03 7.03 4 12 4C16.97 4 21 8.03 21 13V18" stroke="#059669" strokeWidth={1.8} strokeLinecap="round" />
      <Rect x="2" y="12" width="3" height="6" rx="1.5" fill="#D1FAE5" stroke="#059669" strokeWidth={1.5} />
      <Rect x="19" y="12" width="3" height="6" rx="1.5" fill="#D1FAE5" stroke="#059669" strokeWidth={1.5} />
      <Path d="M19 18C19 19.66 17.66 21 16 21H13" stroke="#059669" strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx="12" cy="13" r="3.5" fill="#D1FAE5" stroke="#059669" strokeWidth={1.5} />
    </Svg>
  );
}

type UtilityLinkItem = {
  id: string;
  label: string;
  sublabel: string;
  iconBgClass: string;
  badge?: string;
  icon: React.ComponentType;
};

const UTILITY_LINKS: UtilityLinkItem[] = [
  {
    id: 'history',
    label: 'Lịch sử',
    sublabel: 'Đặt lại dịch vụ',
    iconBgClass: 'bg-orange-50',
    icon: HistoryTicketIcon,
  },
  {
    id: 'favorites',
    label: 'Yêu thích',
    sublabel: 'Thợ đã lưu',
    iconBgClass: 'bg-rose-50',
    icon: FavoriteHeartIcon,
  },
  {
    id: 'referral',
    label: 'Giới thiệu',
    sublabel: 'Nhận voucher 50k',
    iconBgClass: 'bg-amber-100/70',
    badge: 'HOT',
    icon: ReferralGiftIcon,
  },
  {
    id: 'support',
    label: 'Hỗ trợ 24/7',
    sublabel: 'Kỹ thuật viên trực',
    iconBgClass: 'bg-emerald-50',
    icon: SupportHeadsetIcon,
  },
];

export const UtilityLinks = React.memo(() => {
  const handleItemPress = React.useCallback((label: string) => {
    showMessage({
      message: label,
      description: 'Tính năng sẽ sớm ra mắt!',
      type: 'info',
    });
  }, []);

  return (
    <View className="flex-row flex-wrap justify-between gap-y-2.5">
      {UTILITY_LINKS.map((item) => {
        const IconComponent = item.icon;
        return (
          <Pressable
            key={item.id}
            className="w-[48.5%] flex-row items-center gap-2 rounded-2xl bg-white p-2.5 shadow-sm active:opacity-85"
            onPress={() => handleItemPress(item.label)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View className={`size-9 items-center justify-center rounded-xl ${item.iconBgClass}`}>
              <IconComponent />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1">
                <Text className="text-[13px] font-bold text-neutral-900">
                  {item.label}
                </Text>
                {item.badge && (
                  <View className="rounded-sm bg-red-500 px-1 py-0.5">
                    <Text className="text-[8px] font-extrabold text-white">
                      {item.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="mt-0.5 text-[10.5px] text-neutral-500" numberOfLines={1}>
                {item.sublabel}
              </Text>
            </View>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18L15 12L9 6" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        );
      })}
    </View>
  );
});
