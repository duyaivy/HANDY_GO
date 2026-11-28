import { useLocalSearchParams } from 'expo-router';
import { WorkerDetailScreen } from '@/features/catalog';

export default function CustomerWorkerDetailRoute() {
  const { id, name, avatarUrl, headline, orderId, requestId, bidId } = useLocalSearchParams<{
    id?: string;
    name?: string;
    avatarUrl?: string;
    headline?: string;
    orderId?: string;
    requestId?: string;
    bidId?: string;
  }>();

  return (
    <WorkerDetailScreen
      workerId={id}
      workerName={name}
      avatarUrl={avatarUrl}
      headline={headline}
      orderId={orderId}
      requestId={requestId}
      bidId={bidId}
    />
  );
}
