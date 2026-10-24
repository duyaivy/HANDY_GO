import { Tabs } from 'expo-router';
import * as React from 'react';
import { HomeIcon, OrdersIcon, UserIcon, WalletIcon } from '@/components/ui/icons';
import { SECONDARY_COLOR } from '@/constants/colors';
import { useAuthStore } from '@/stores/use-auth-store';

export default function WorkerTabsLayout() {
  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const user = useAuthStore.use.user();
  const isGuest = !isAuthenticated || !user;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: SECONDARY_COLOR,
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
          title: 'Nhận việc',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Công việc',
          tabBarIcon: ({ color, size }) => <OrdersIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Thu nhập',
          tabBarIcon: ({ color, size }) => <WalletIcon color={color} size={size} />,
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
