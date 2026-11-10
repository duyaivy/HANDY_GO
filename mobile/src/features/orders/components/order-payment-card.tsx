import type { PaymentState } from '../types/order.types';
import * as React from 'react';
import { View } from 'react-native';
import { WalletIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';

export type OrderPaymentCardProps = {
  agreedPrice: number | string | undefined | null;
  paymentState?: PaymentState | string | null;
  paymentMethod?: string | null;
};

function formatVND(amount: number | string | undefined | null): string {
  if (!amount) {
    return '0đ';
  }
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return `${n.toLocaleString('vi-VN')}đ`;
}

function getPaymentStateBadge(state?: string | null) {
  switch (state) {
    case 'paid':
      return {
        label: 'Đã thanh toán',
        bg: 'bg-emerald-100 dark:bg-emerald-950/40',
        text: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'pending':
      return {
        label: 'Đang xử lý',
        bg: 'bg-blue-100 dark:bg-blue-950/40',
        text: 'text-blue-800 dark:text-blue-300',
      };
    case 'refunded':
      return {
        label: 'Đã hoàn tiền',
        bg: 'bg-purple-100 dark:bg-purple-950/40',
        text: 'text-purple-800 dark:text-purple-300',
      };
    case 'failed':
      return {
        label: 'Thất bại',
        bg: 'bg-rose-100 dark:bg-rose-950/40',
        text: 'text-rose-800 dark:text-rose-300',
      };
    case 'unpaid':
    default:
      return {
        label: 'Thanh toán khi xong',
        bg: 'bg-amber-100 dark:bg-amber-950/40',
        text: 'text-amber-800 dark:text-amber-300',
      };
  }
}

export function OrderPaymentCard({
  agreedPrice,
  paymentState,
  paymentMethod = 'Tiền mặt khi hoàn tất',
}: OrderPaymentCardProps) {
  const badge = getPaymentStateBadge(paymentState);
  const formattedTotal = formatVND(agreedPrice);

  return (
    <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-xl bg-primary/10">
            <WalletIcon size={18} color="#F5A524" />
          </View>
          <Text className="text-sm font-bold text-neutral-900 dark:text-white">
            Chi phí & Thanh toán
          </Text>
        </View>

        <View className={`rounded-full px-2.5 py-0.5 ${badge.bg}`}>
          <Text className={`text-[11px] font-bold ${badge.text}`}>
            {badge.label}
          </Text>
        </View>
      </View>

      <View className="mt-3 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            Giá dịch vụ thỏa thuận
          </Text>
          <Text className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {formattedTotal}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            Phương thức thanh toán
          </Text>
          <Text className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {paymentMethod}
          </Text>
        </View>

        {/* Total summary */}
        <View className="mt-2 flex-row items-center justify-between border-t border-dashed border-neutral-200 pt-3 dark:border-neutral-700">
          <View>
            <Text className="text-xs font-bold text-neutral-900 dark:text-white">
              TỔNG THANH TOÁN
            </Text>
            <Text className="text-[10px] text-neutral-400">
              (Đã bao gồm VAT & vật tư thỏa thuận)
            </Text>
          </View>
          <Text className="text-base font-extrabold text-primary">
            {formattedTotal}
          </Text>
        </View>
      </View>
    </View>
  );
}
