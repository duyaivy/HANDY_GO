import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { LoginScreen } from '../screens/login-screen';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
}));

afterEach(cleanup);

describe('loginScreen', () => {
  it('renders screen title, route and responsible owner', () => {
    render(<LoginScreen />);
    expect(screen.getByText('Màn hình Đăng nhập')).toBeOnTheScreen();
    expect(screen.getByText('Route: /login')).toBeOnTheScreen();
    expect(screen.getByText('Auth / User & Trust Service Owner')).toBeOnTheScreen();
  });
});
