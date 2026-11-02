import { useLocalSearchParams } from 'expo-router';
import { CustomerBookingScreen } from '@/features/orders/customer';

export default function CustomerBookingRoute() {
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  return <CustomerBookingScreen serviceId={serviceId} />;
}
