import * as React from 'react';
import { AppState } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { ERROR_CODES } from '@/services/api/api-error';
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
  jest.restoreAllMocks();
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
  it('renders 6 OTP boxes, the server-synchronized countdown circle, Gmail, and buttons', () => {
    mockParams = {
      email: 'customer@example.com',
      emailMasked: 'c***r@example.com',
      resendAvailableAt: new Date(Date.now() + 60000).toISOString(),
    };

    render(<OtpVerificationScreen />);
    expect(screen.getByTestId('auth-otp-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-input')).toBeOnTheScreen();

    for (let index = 0; index < 6; index++) {
      expect(screen.getByTestId(`otp-box-${index}`)).toBeOnTheScreen();
    }

    expect(screen.getByTestId('otp-countdown-circle')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-countdown-text')).toBeOnTheScreen();
    expect(screen.getByText('Mã xác thực gồm 6 chữ số đã được gửi đến Gmail:')).toBeOnTheScreen();
    expect(screen.getByText('c***r@example.com')).toBeOnTheScreen();

    expect(screen.getByTestId('otp-submit-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('otp-resend-btn')).toBeOnTheScreen();
  });

  it('initializes the cooldown from resendAvailableAt', () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);
    mockParams = {
      email: 'customer@example.com',
      resendAvailableAt: new Date(now + 42000).toISOString(),
    };

    render(<OtpVerificationScreen />);

    expect(screen.getByTestId('otp-countdown-text')).toHaveTextContent('42s');
  });

  it('recalculates the cooldown when the app returns to foreground', () => {
    jest.useFakeTimers();
    const now = Date.now();
    jest.setSystemTime(now);
    mockParams = { resendAvailableAt: new Date(now + 50000).toISOString() };
    let onAppStateChange: ((state: 'active' | 'background' | 'inactive') => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppStateChange = listener as typeof onAppStateChange;
      return { remove: jest.fn() } as any;
    });

    render(<OtpVerificationScreen />);
    expect(screen.getByTestId('otp-countdown-text')).toHaveTextContent('50s');

    jest.setSystemTime(now + 35000);
    act(() => onAppStateChange?.('active'));

    expect(screen.getByTestId('otp-countdown-text')).toHaveTextContent('15s');
  });

  it('validates OTP length is 6 digits', async () => {
    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    expect(
      await screen.findByText('Vui lòng nhập đúng 6 chữ số mã OTP'),
    ).toBeOnTheScreen();
  });

  it('verifies a 6-digit OTP and navigates to the customer app', async () => {
    mockParams = {
      email: 'customer@example.com',
      phone: '0912345678',
      challengeId: 'challenge-123',
    };
    const verifySpy = jest.spyOn(AuthApi, 'verifyOtp').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 300,
        user: {
          id: 'user-1',
          phone: '0912345678',
          email: 'customer@example.com',
          roles: ['Customer'],
          permissions: [],
        },
      },
    });
    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {} as any,
    });

    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith({
        challengeId: 'challenge-123',
        email: 'customer@example.com',
        phone: '0912345678',
        otp: '123456',
      });
      expect(mockReplace).toHaveBeenCalledWith('/customer');
    });
  });

  it('shows the email delivery failure message and resends with the new server cooldown', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const resendAvailableAt = new Date(now + 45000).toISOString();
    mockParams = {
      email: 'customer@example.com',
      phone: '0912345678',
      deliveryFailed: 'true',
    };

    const resendSpy = jest.spyOn(AuthApi, 'resendOtp').mockResolvedValue({
      statusCode: 200,
      message: 'Mã xác thực OTP mới đã được gửi',
      data: {
        challengeId: 'new-challenge-456',
        resendAvailableAt,
      },
    });

    render(<OtpVerificationScreen />);
    expect(screen.getByText(/Không thể gửi mã OTP đến email của bạn/)).toBeOnTheScreen();

    const resendBtn = screen.getByTestId('otp-resend-btn');
    fireEvent.press(resendBtn);

    await waitFor(() => {
      expect(resendSpy).toHaveBeenCalledWith({ email: 'customer@example.com', phone: '0912345678' });
      expect(screen.getByTestId('otp-countdown-text')).toHaveTextContent('45s');
      expect(screen.getByText('Mã OTP mới đã được gửi thành công.')).toBeOnTheScreen();
    });
  });

  it('shows the remaining attempt count when the backend rejects the OTP', async () => {
    mockParams = { email: 'customer@example.com', challengeId: 'challenge-123' };
    jest.spyOn(AuthApi, 'verifyOtp').mockRejectedValue({
      code: ERROR_CODES.OTP_INVALID,
      details: { remainingAttempts: 2 },
    });

    render(<OtpVerificationScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    expect(await screen.findByText('Mã OTP không chính xác. Bạn còn 2 lần thử.')).toBeOnTheScreen();
  });

  it('navigates back to login when clicking back to login button', () => {
    render(<OtpVerificationScreen />);
    fireEvent.press(screen.getByTestId('otp-back-btn'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });
});
