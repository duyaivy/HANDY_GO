import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { WorkerHomeScreen } from '../screens/worker-home-screen';

afterEach(cleanup);

describe('workerHomeScreen', () => {
  it('renders screen title, route and responsible owner', () => {
    render(<WorkerHomeScreen />);
    expect(screen.getByText('Trang chủ Thợ')).toBeOnTheScreen();
    expect(screen.getByText('Route: /worker')).toBeOnTheScreen();
    expect(screen.getByText('Worker Home Owner')).toBeOnTheScreen();
  });
});
