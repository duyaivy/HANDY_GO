import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { LoginScreen } from '../screens/login-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.getState().setUser(null);
  useAuthStore.getState().clearError();
});

describe('loginScreen', () => {
  it('renders phone input, password input, and submit button', () => {
    render(<LoginScreen />);
    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('login-phone-input')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password-input')).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit-button')).toBeOnTheScreen();
    expect(screen.getByTestId('login-to-register-btn')).toBeOnTheScreen();
  });

  it('validates empty inputs and displays error', async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('login-submit-button'));

    expect(await screen.findByText('Vui lòng nhập số điện thoại')).toBeOnTheScreen();
    expect(await screen.findByText('Vui lòng nhập mật khẩu')).toBeOnTheScreen();
  });

  it('validates invalid Vietnamese phone number format', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-phone-input'), '123456');
    fireEvent.changeText(screen.getByTestId('login-password-input'), '123456');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    expect(
      await screen.findByText('Số điện thoại không đúng định dạng Việt Nam'),
    ).toBeOnTheScreen();
  });

  it('calls login and navigates to customer home on customer login success', async () => {
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

  it('navigates to OTP verification screen if account is pending verification', async () => {
    const mockLogin = jest.fn().mockRejectedValue({
      statusCode: 403,
      message: 'Tài khoản chưa được kích hoạt. Vui lòng xác thực mã OTP.',
    });
    useAuthStore.setState({ login: mockLogin });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-phone-input'), '0912345678');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'Password123');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(auth)/otp',
          params: { phone: '0912345678' },
        }),
      );
    });
  });

  it('navigates to register screen when pressing register link', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByTestId('login-to-register-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register');
  });
});
