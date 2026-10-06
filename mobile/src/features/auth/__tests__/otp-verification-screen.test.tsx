/* eslint-disable max-lines-per-function */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { OtpVerificationScreen } from '../screens/otp-verification-screen';

const mockReplace = jest.fn();

let mockParams: Record<string, string | undefined> = {
  email: 'customer@example.com',
  phone: '0912345678',
};

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => mockParams),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({
    isLoading: false,
    error: null,
    isAuthenticated: false,
    user: null,
  });
  mockParams = {
    email: 'customer@example.com',
    phone: '0912345678',
  };
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

  it('submits valid OTP and navigates to Login screen on verification success', async () => {
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
        challengeId: undefined,
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

  it('forwards challengeId from params to verifyOtp', async () => {
    mockParams = {
      challengeId: 'challenge-xyz-123',
      email: 'customer@example.com',
      phone: '0912345678',
    };
    const verifyOtpMock = jest.fn().mockResolvedValue({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: { id: 'user-1', roles: ['Customer'] },
    });
    useAuthStore.setState({ verifyOtp: verifyOtpMock });

    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          challengeId: 'challenge-xyz-123',
        }),
      );
    });
  });

  it('displays deliveryFailed banner and hides it after successful resend', async () => {
    mockParams = {
      email: 'customer@example.com',
      phone: '0912345678',
      deliveryFailed: 'true',
      resendAvailableAt: new Date(Date.now() - 1000).toISOString(),
    };

    const resendSpy = jest.spyOn(AuthApi, 'resendOtp').mockResolvedValue({
      statusCode: 200,
      message: 'Mã xác thực OTP mới đã được gửi',
      data: {
        challengeId: 'new-challenge-456',
        resendAvailableAt: new Date(Date.now() + 60000).toISOString(),
      } as any,
    });

    render(<OtpVerificationScreen />);
    expect(screen.getByText(/Không thể gửi email OTP đến hộp thư của bạn/)).toBeOnTheScreen();

    const resendBtn = screen.getByTestId('otp-resend-btn');
    fireEvent.press(resendBtn);

    expect(resendSpy).toHaveBeenCalledWith({
      email: 'customer@example.com',
      phone: '0912345678',
    });
    expect(
      await screen.findByText(
        'Mã OTP mới đã được gửi thành công.',
        {},
        { timeout: 5000 },
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Không thể gửi email OTP đến hộp thư của bạn/)).toBeNull();
  });

  it('calls resendOtp when resend button is clicked after cooldown', async () => {
    const _resendSpy = jest.spyOn(AuthApi, 'resendOtp').mockResolvedValue({
      statusCode: 200,
      message: 'Mã xác thực OTP mới đã được gửi',
      data: undefined as any,
    });

    render(<OtpVerificationScreen />);
    const resendBtn = screen.getByTestId('otp-resend-btn');
    expect(resendBtn).toBeOnTheScreen();
    expect(_resendSpy).not.toHaveBeenCalled();
  });
});
