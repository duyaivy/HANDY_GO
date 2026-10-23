import { Tabs } from 'expo-router';
import * as React from 'react';
import { BellIcon, HomeIcon, OrdersIcon, UserIcon } from '@/components/ui/icons';
import { PRIMARY_COLOR } from '@/constants/colors';
import { useUnreadNotifications } from '@/features/notifications/hooks/use-notifications';
import { useAuthStore } from '@/stores/use-auth-store';

export default function CustomerTabsLayout() {
  const { data: unread } = useUnreadNotifications();
  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const user = useAuthStore.use.user();
  const isGuest = !isAuthenticated || !user;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: PRIMARY_COLOR,
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: isGuest
          ? { display: 'none' }
          : {
              backgroundColor: '#FFFFFF',
              borderTopColor: '#F3F4F6',
              height: 60,
              paddingBottom: 8,
              paddingTop: 6,
            },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trang chủ',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Hoạt động',
          tabBarIcon: ({ color, size }) => <OrdersIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Thông báo',
          tabBarBadge: unread?.count ? (unread.count > 99 ? '99+' : unread.count) : undefined,
          tabBarIcon: ({ color, size }) => <BellIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
