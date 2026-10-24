import { useLocalSearchParams } from 'expo-router';
import { CustomerOrderDetailScreen } from '@/features/orders/customer';

export default function CustomerOrderDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CustomerOrderDetailScreen orderId={id} />;
}
