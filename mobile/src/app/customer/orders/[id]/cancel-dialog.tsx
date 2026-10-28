import { useLocalSearchParams } from 'expo-router';
import { CustomerOrderCancelDialog } from '@/features/orders/customer';

export default function OrderCancelDialogRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CustomerOrderCancelDialog orderId={id} />;
}
