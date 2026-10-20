import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export type WorkerJobCompleteScreenProps = {
  jobId?: string;
};

export function WorkerJobCompleteScreen({ jobId: propJobId }: WorkerJobCompleteScreenProps = {}) {
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const jobId = propJobId || searchParams?.id || 'JOB-1020';

  return (
    <PlaceholderScreen
      pageName="Nghiệm thu công việc"
      title="Nghiệm thu công việc"
      subtitle={`Đơn việc #${jobId}`}
      testID="worker-job-complete-screen"
    />
  );
}
