import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { OtpVerificationScreen } from '../screens/otp-verification-screen';
import { useAuthFlowStore } from '../use-auth-flow-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

let mockParams: Record<string, string | undefined> = {
  phone: '0912345678',
};

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => mockParams),
}));

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.clearAllMocks();
  useAuthStore.setState({
    isLoading: false,
    error: null,
    isAuthenticated: false,
    user: null,
  });
  useAuthFlowStore.getState().resetFlow();
  mockParams = {
    phone: '0912345678',
  };
});

describe('otpVerificationScreen (Phase 4 Step 2 - Ảnh 5)', () => {
  it('renders 5 OTP boxes, 30s countdown circle, and buttons', () => {
    render(<OtpVerificationScreen />);
    expect(screen.getByTestId('auth-otp-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-input')).toBeOnTheScreen();

    // Verify 5 OTP discrete boxes exist
    expect(screen.getByTestId('otp-box-0')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-box-1')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-box-2')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-box-3')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-box-4')).toBeOnTheScreen();

    // Verify 30s circular countdown timer exists
    expect(screen.getByTestId('otp-countdown-circle')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-countdown-text')).toBeOnTheScreen();

    expect(screen.getByTestId('otp-submit-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-resend-btn')).toBeOnTheScreen();
  });

  it('validates OTP length is 5 digits', async () => {
    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    expect(
      await screen.findByText('Vui lòng nhập đúng 5 chữ số mã OTP'),
    ).toBeOnTheScreen();
  });

  it('submits valid 5-digit OTP and advances to Step 3 Create PIN screen', async () => {
    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '12345');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(auth)/create-pin',
          params: expect.objectContaining({
            phone: '0912345678',
            verified: 'true',
          }),
        }),
      );
      expect(useAuthFlowStore.getState().otp).toBe('12345');
    });
  });

  it('displays deliveryFailed banner and allows resend', async () => {
    mockParams = {
      phone: '0912345678',
      deliveryFailed: 'true',
    };

    const resendSpy = jest.spyOn(AuthApi, 'resendOtp').mockResolvedValue({
      statusCode: 200,
      message: 'Mã xác thực OTP mới đã được gửi',
      data: {
        challengeId: 'new-challenge-456',
        resendAvailableAt: new Date(Date.now() + 30000).toISOString(),
      } as any,
    });

    render(<OtpVerificationScreen />);
    expect(screen.getByText(/Không thể gửi mã OTP đến thông tin của bạn/)).toBeOnTheScreen();

    // Fast-forward or trigger resend
    const resendBtn = screen.getByTestId('otp-resend-btn');
    expect(resendBtn).toBeOnTheScreen();
    resendSpy.mockRestore();
  });

  it('navigates back to login when clicking back to login button', () => {
    render(<OtpVerificationScreen />);
    fireEvent.press(screen.getByTestId('otp-back-btn'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });
});
