import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export type CustomerOrderInfoModalProps = {
  orderId?: string;
};

export function CustomerOrderInfoModal({ orderId: propOrderId }: CustomerOrderInfoModalProps = {}) {
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const orderId = propOrderId || searchParams?.id || 'demo-001';

  return (
    <PlaceholderScreen
      pageName="Chi tiết đơn dịch vụ"
      title="Chi tiết đơn dịch vụ"
      subtitle={`Mã đơn: #${orderId}`}
      testID="order-detail-info-modal"
    />
  );
}
