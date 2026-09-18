import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { WorkerProfileScreen } from '../screens/worker-profile-screen';

afterEach(cleanup);

describe('workerProfileScreen', () => {
  it('renders screen title, route and responsible owner', () => {
    render(<WorkerProfileScreen />);
    expect(screen.getByText('Hồ sơ Thợ')).toBeOnTheScreen();
    expect(screen.getByText('Route: /worker/profile')).toBeOnTheScreen();
    expect(screen.getByText('Worker Profile Owner')).toBeOnTheScreen();
  });
});
