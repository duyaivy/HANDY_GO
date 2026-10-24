import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { WorkerJobsScreen } from '../screens/worker-jobs-screen';

afterEach(cleanup);

describe('workerJobsScreen', () => {
  it('renders screen title and placeholder message', () => {
    render(<WorkerJobsScreen />);
    expect(screen.getByText('Công việc của tôi')).toBeOnTheScreen();
    expect(screen.getByTestId('orders-worker-jobs-screen')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
  });
});
