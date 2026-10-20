import * as React from 'react';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export function WorkerJobsScreen() {
  return (
    <PlaceholderScreen
      pageName="Công việc của tôi"
      title="Công việc của tôi"
      mode="stack"
      hideBackButton
      testID="orders-worker-jobs-screen"
    />
  );
}
