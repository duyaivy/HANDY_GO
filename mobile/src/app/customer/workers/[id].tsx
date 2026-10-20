import { useLocalSearchParams } from 'expo-router';
import { WorkerDetailScreen } from '@/features/catalog';

export default function CustomerWorkerDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <WorkerDetailScreen workerId={id} />;
}
