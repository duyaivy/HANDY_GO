import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { CustomerHomeScreen } from '../screens/customer-home-screen';

afterEach(cleanup);

describe('customerHomeScreen', () => {
  it('renders screen title, route and responsible owner', () => {
    render(<CustomerHomeScreen />);
    expect(screen.getByText('Trang chủ Khách')).toBeOnTheScreen();
    expect(screen.getByText('Route: /customer')).toBeOnTheScreen();
    expect(screen.getByText('Customer Home Owner')).toBeOnTheScreen();
  });
});
