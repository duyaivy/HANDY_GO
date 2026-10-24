import { useLocalSearchParams } from 'expo-router';
import { ServiceDetailScreen } from '@/features/catalog';

export default function CustomerServiceDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ServiceDetailScreen serviceId={id} />;
}
