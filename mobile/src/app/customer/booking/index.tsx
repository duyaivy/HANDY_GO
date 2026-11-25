import { useLocalSearchParams } from 'expo-router';
import { CustomerBookingScreen } from '@/features/orders/customer';

export default function CustomerBookingRoute() {
  const {
    serviceId,
    serviceName,
    categoryId,
    categoryName,
  } = useLocalSearchParams<{
    serviceId?: string;
    serviceName?: string;
    categoryId?: string;
    categoryName?: string;
  }>();
  return (
    <CustomerBookingScreen
      serviceId={serviceId}
      serviceName={serviceName}
      categoryId={categoryId}
      categoryName={categoryName}
    />
  );
}
