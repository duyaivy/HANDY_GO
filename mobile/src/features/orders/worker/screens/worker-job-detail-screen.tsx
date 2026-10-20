import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export type WorkerJobDetailScreenProps = {
  jobId?: string;
};

export function WorkerJobDetailScreen({ jobId: propJobId }: WorkerJobDetailScreenProps = {}) {
  const searchParams = typeof useLocalSearchParams === 'function' ? useLocalSearchParams<{ id?: string }>() : {};
  const jobId = propJobId || searchParams?.id || 'JOB-1020';

  return (
    <PlaceholderScreen
      pageName="Chi tiết đơn việc"
      title="Chi tiết đơn việc"
      subtitle={`Mã đơn: #${jobId}`}
      testID="worker-job-detail-screen"
    />
  );
}
