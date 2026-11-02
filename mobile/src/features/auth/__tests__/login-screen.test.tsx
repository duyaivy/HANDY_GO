/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { LoginScreen } from '../screens/login-screen';
import { useAuthFlowStore } from '../use-auth-flow-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack };

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(() => mockRouter),
    useLocalSearchParams: jest.fn(() => ({})),
    useRootNavigationState: () => ({
      key: 'root-test',
    }),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.clearAllMocks();
  useAuthStore.getState().setUser(null);
  useAuthStore.getState().clearError();
  useAuthFlowStore.getState().resetFlow();
});

describe('loginScreen (Phase 4 Step 1 - Default Password Login)', () => {
  it('renders phone input, password input, and Đăng nhập button by default', () => {
    render(<LoginScreen />);
    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('login-phone-input')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password-input')).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit-button')).toBeOnTheScreen();
    expect(screen.getAllByText('Đăng nhập').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('login-to-register-btn')).toBeOnTheScreen();
  });

  it('validates empty phone input and displays error', async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('login-submit-button'));

    expect(await screen.findByText('Vui lòng nhập số điện thoại')).toBeOnTheScreen();
  });

  it('validates invalid Vietnamese phone number format', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-phone-input'), '123456');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    expect(
      await screen.findByText('Số điện thoại không đúng định dạng Việt Nam'),
    ).toBeOnTheScreen();
  });

  it('shows clear button ✕ when phone has text, and clears phone on press', () => {
    render(<LoginScreen />);
    expect(screen.queryByTestId('login-clear-phone-btn')).toBeNull();

    fireEvent.changeText(screen.getByTestId('login-phone-input'), '0912345678');
    expect(screen.getByTestId('login-clear-phone-btn')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('login-clear-phone-btn'));
    expect(screen.queryByTestId('login-clear-phone-btn')).toBeNull();
  });

  it('validates empty password input and displays error', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-phone-input'), '0912345678');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    expect(await screen.findByText('Vui lòng nhập mật khẩu')).toBeOnTheScreen();
  });

  it('supports password login and navigates on success', async () => {
    const mockLogin = jest.fn().mockResolvedValue({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 300,
      user: {
        id: 'user-1',
        phone: '+84912345678',
        email: 'c@example.com',
        roles: ['Customer'],
        permissions: ['profile:read'],
      },
    });
    useAuthStore.setState({ login: mockLogin });

    render(<LoginScreen />);
    expect(screen.getByTestId('login-password-input')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('login-phone-input'), '0912345678');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'Password123');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        phone: '0912345678',
        password: 'Password123',
      });
      expect(mockReplace).toHaveBeenCalledWith('/customer');
    });
  });

  it('navigates to register screen when pressing register link', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('login-to-register-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register');
  });

  it('navigates to forgot password when pressing the link in password mode', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('login-forgot-password-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('calls router.back when canGoBack is true and back button is pressed', () => {
    mockCanGoBack.mockReturnValue(true);
    render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('app-bar-back-btn'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to welcome when canGoBack is false and back button is pressed', () => {
    mockCanGoBack.mockReturnValue(false);
    render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('app-bar-back-btn'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });
});
