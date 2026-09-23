import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { WorkerJobsScreen } from '../screens/worker-jobs-screen';

afterEach(cleanup);

describe('workerJobsScreen', () => {
  it('renders screen title, route and responsible owner', () => {
    render(<WorkerJobsScreen />);
    expect(screen.getByText('Danh sách công việc của Thợ')).toBeOnTheScreen();
    expect(screen.getByText('Route: /worker/jobs')).toBeOnTheScreen();
    expect(screen.getByText('Worker Orders / Jobs Owner')).toBeOnTheScreen();
  });
});
