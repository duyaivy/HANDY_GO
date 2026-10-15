import * as React from 'react';

import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { BaseDemoScreen } from '../screens/base-demo-screen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  })),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('baseDemoScreen', () => {
  it('renders correctly with title and ownership badge', () => {
    render(<BaseDemoScreen />);
    expect(screen.getByText('HANDYGO MOBILE')).toBeOnTheScreen();
    expect(screen.getByText('Module: features/dev-demo | Owner: Base/Integration')).toBeOnTheScreen();
  });

  it('navigates to customer flow when pressing customer button', () => {
    render(<BaseDemoScreen />);
    const customerBtn = screen.getByTestId('dev-demo-open-customer');
    fireEvent.press(customerBtn);
    expect(mockPush).toHaveBeenCalledWith('/customer');
  });

  it('navigates to worker flow when pressing worker button', () => {
    render(<BaseDemoScreen />);
    const workerBtn = screen.getByTestId('dev-demo-open-worker');
    fireEvent.press(workerBtn);
    expect(mockPush).toHaveBeenCalledWith('/worker');
  });

  it('navigates to login when pressing login button', () => {
    render(<BaseDemoScreen />);
    const loginBtn = screen.getByTestId('dev-demo-open-login');
    fireEvent.press(loginBtn);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
