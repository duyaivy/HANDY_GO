import { useLocalSearchParams } from 'expo-router';
import { CustomerOrderInfoModal } from '@/features/orders/customer';

export default function OrderDetailInfoModalRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CustomerOrderInfoModal orderId={id} />;
}
