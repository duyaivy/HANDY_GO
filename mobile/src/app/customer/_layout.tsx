/* eslint-disable max-lines-per-function */
import { Stack } from 'expo-router';
import * as React from 'react';
import { RoleGuard } from '@/lib/auth/role-guard';

export default function CustomerLayout() {
  return (
    <>
      <RoleGuard allowedRoles={['Customer']} allowGuest />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile/detail" options={{ headerShown: false }} />
        <Stack.Screen
          name="orders/[id]"
          options={{
            title: 'Báo giá thợ',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="orders/[id]/detail"
          options={{
            title: 'Chi tiết đơn',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="orders/[id]/cancel-dialog"
          options={{
            title: 'Hủy đơn',
            presentation: 'transparentModal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="services/[id]"
          options={{
            title: 'Chi tiết dịch vụ',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="booking/index"
          options={{
            title: 'Mô tả sự cố',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="booking/select-address"
          options={{
            title: 'Chọn địa chỉ',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="booking/select-time"
          options={{
            title: 'Chọn thời gian',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="booking/summary"
          options={{
            title: 'Tóm tắt đơn đặt việc',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="booking/radar"
          options={{
            title: 'Tìm thợ radar',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="workers/[id]"
          options={{
            title: 'Hồ sơ thợ',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="category"
          options={{
            title: 'Danh mục dịch vụ',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ai-diagnosis"
          options={{
            title: 'AI phân tích vấn đề',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Cài đặt',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="history"
          options={{
            title: 'Lịch sử',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="favorites"
          options={{
            title: 'Yêu thích',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="referral"
          options={{
            title: 'Giới thiệu bạn bè',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="support"
          options={{
            title: 'Hỗ trợ 24/7',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ask-me"
          options={{
            title: 'Trợ lý AI (Ask me)',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="search-address"
          options={{
            title: 'Tìm kiếm địa chỉ',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="saved-addresses"
          options={{
            title: 'Địa chỉ đã lưu',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="chat"
          options={{
            title: 'Trò chuyện',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="payment/index"
          options={{
            title: 'Quản lý thanh toán',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="payment/link-account"
          options={{
            title: 'Link account',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="payment/transaction-history"
          options={{
            title: 'Transaction history',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="profile-detail"
          options={{
            title: 'Profile',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="switch-to-worker"
          options={{
            title: 'Switching to Worker App',
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}
