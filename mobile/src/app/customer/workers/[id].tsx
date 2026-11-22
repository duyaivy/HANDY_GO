import { useLocalSearchParams } from 'expo-router';
import { WorkerDetailScreen } from '@/features/catalog';

export default function CustomerWorkerDetailRoute() {
  const { id, name, phone, phoneNumber, avatarUrl, headline } = useLocalSearchParams<{
    id?: string;
    name?: string;
    phone?: string;
    phoneNumber?: string;
    avatarUrl?: string;
    headline?: string;
  }>();

  return (
    <WorkerDetailScreen
      workerId={id}
      workerName={name}
      phoneNumber={phone || phoneNumber}
      avatarUrl={avatarUrl}
      headline={headline}
    />
  );
}
