import { useLocalSearchParams } from 'expo-router';
import { WorkerJobDetailScreen } from '@/features/orders/worker';

export default function WorkerJobDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <WorkerJobDetailScreen jobId={id} />;
}
