import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { CustomerProfileScreen } from '../screens/customer-profile-screen';

afterEach(cleanup);

describe('customerProfileScreen', () => {
  it('renders screen title, route and responsible owner', () => {
    render(<CustomerProfileScreen />);
    expect(screen.getByText('Hồ sơ Khách')).toBeOnTheScreen();
    expect(screen.getByText('Route: /customer/profile')).toBeOnTheScreen();
    expect(screen.getByText('Customer Profile Owner')).toBeOnTheScreen();
  });
});
