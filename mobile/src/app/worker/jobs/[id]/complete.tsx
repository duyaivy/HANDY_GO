import { useLocalSearchParams } from 'expo-router';
import { WorkerJobCompleteScreen } from '@/features/orders/worker';

export default function WorkerJobCompleteRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <WorkerJobCompleteScreen jobId={id} />;
}
