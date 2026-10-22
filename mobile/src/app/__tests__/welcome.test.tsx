/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import WelcomeScreen from '../welcome';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({ guestRole: null });
});

describe('welcomeScreen (role picker)', () => {
  it('should render customer and worker role selection cards', () => {
    render(<WelcomeScreen />);

    expect(screen.getByText('Bạn là Khách hàng hay Thợ sửa chữa?')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-customer-card')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-worker-card')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-submit-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-login-link')).toBeOnTheScreen();
  });

  it('selects Customer by default and navigates to /customer on submit', () => {
    render(<WelcomeScreen />);

    const submitBtn = screen.getByTestId('welcome-submit-btn');
    fireEvent.press(submitBtn);

    expect(useAuthStore.getState().guestRole).toBe('Customer');
    expect(mockReplace).toHaveBeenCalledWith('/customer');
  });

  it('allows picking Worker role and navigates to /worker on submit', () => {
    render(<WelcomeScreen />);

    const workerCard = screen.getByTestId('welcome-worker-card');
    fireEvent.press(workerCard);

    const submitBtn = screen.getByTestId('welcome-submit-btn');
    fireEvent.press(submitBtn);

    expect(useAuthStore.getState().guestRole).toBe('Worker');
    expect(mockReplace).toHaveBeenCalledWith('/worker');
  });

  it('navigates to login screen when clicking the login link', () => {
    render(<WelcomeScreen />);

    const loginLink = screen.getByTestId('welcome-login-link');
    fireEvent.press(loginLink);

    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });
});
