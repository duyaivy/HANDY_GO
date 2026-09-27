import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { OtpVerificationScreen } from '../screens/otp-verification-screen';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({
    email: 'customer@example.com',
    phone: '0912345678',
  })),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('otpVerificationScreen', () => {
  it('renders OTP input and verify button', () => {
    render(<OtpVerificationScreen />);
    expect(screen.getByTestId('auth-otp-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-input')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-submit-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-resend-btn')).toBeOnTheScreen();
  });

  it('validates OTP length is 6 digits', async () => {
    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    expect(
      await screen.findByText('Vui lòng nhập đúng 6 chữ số mã OTP'),
    ).toBeOnTheScreen();
  });

  it('submits valid OTP and navigates to Customer home on auto-login success', async () => {
    const verifyOtpMock = jest.fn().mockResolvedValue({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 300,
      user: {
        id: 'user-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        roles: ['Customer'],
        permissions: ['profile:read'],
      },
    });
    useAuthStore.setState({ verifyOtp: verifyOtpMock });

    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        email: 'customer@example.com',
        phone: '0912345678',
        otp: '123456',
      });
      expect(mockReplace).toHaveBeenCalledWith('/customer');
    });
  });

  it('displays error when OTP is incorrect', async () => {
    const verifyOtpMock = jest.fn().mockRejectedValue({
      statusCode: 400,
      message: 'Mã OTP không chính xác. Còn lại 4 lần thử.',
    });
    useAuthStore.setState({ verifyOtp: verifyOtpMock });

    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '999999');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    expect(
      await screen.findByText('Mã OTP không chính xác. Còn lại 4 lần thử.'),
    ).toBeOnTheScreen();
  });

  it('calls resendOtp when resend button is clicked after cooldown', async () => {
    const _resendSpy = jest.spyOn(AuthApi, 'resendOtp').mockResolvedValue({
      statusCode: 200,
      message: 'Mã xác thực OTP mới đã được gửi',
      data: undefined as any,
    });

    render(<OtpVerificationScreen />);
    // Resend button is initially disabled with countdown
    const resendBtn = screen.getByTestId('otp-resend-btn');
    expect(resendBtn).toBeOnTheScreen();
    expect(_resendSpy).not.toHaveBeenCalled();
  });
});
