/* eslint-disable react/no-unnecessary-use-prefix */
/* eslint-disable max-lines-per-function */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { ForgotPasswordScreen } from '../screens/forgot-password-screen';
import { ResetPasswordScreen } from '../screens/reset-password-screen';
import { VerifyResetOtpScreen } from '../screens/verify-reset-otp-screen';
import { usePasswordResetStore } from '../use-password-reset-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  usePasswordResetStore.getState().clear();
});

describe('password reset screens', () => {
  it('validates email, calls forgot-password, and continues without account-specific feedback', async () => {
    const request = jest.spyOn(AuthApi, 'forgotPassword').mockResolvedValue({
      statusCode: 200,
      message: 'generic response',
      data: null,
    });
    render(<ForgotPasswordScreen />);

    fireEvent.press(screen.getByTestId('forgot-password-submit-button'));
    expect(await screen.findByText('Vui lòng nhập địa chỉ email')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByTestId('forgot-password-email-input'), '  USER@example.com ');
    fireEvent.press(screen.getByTestId('forgot-password-submit-button'));
    await waitFor(() => {
      expect(request).toHaveBeenCalledWith({ email: 'user@example.com' });
      expect(mockPush).toHaveBeenCalledWith('/(auth)/verify-reset-otp');
      expect(usePasswordResetStore.getState().email).toBe('user@example.com');
    });
  });

  it('validates OTP length and stores the reset token only in memory', async () => {
    usePasswordResetStore.getState().setEmail('user@example.com');
    const verify = jest.spyOn(AuthApi, 'verifyResetOtp').mockResolvedValue({
      statusCode: 200,
      message: 'verified',
      data: { resetToken: 'short-lived-reset-token', expiresIn: 900 },
    });
    render(<VerifyResetOtpScreen />);

    fireEvent.press(screen.getByTestId('verify-reset-otp-submit-button'));
    expect(await screen.findByText('Vui lòng nhập đúng 6 chữ số mã OTP')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByTestId('verify-reset-otp-input'), '123456');
    fireEvent.press(screen.getByTestId('verify-reset-otp-submit-button'));
    await waitFor(() => {
      expect(verify).toHaveBeenCalledWith({ email: 'user@example.com', otp: '123456' });
      expect(usePasswordResetStore.getState().resetToken).toBe('short-lived-reset-token');
      expect(mockPush).toHaveBeenCalledWith('/(auth)/reset-password');
    });
  });

  it('shows a generic error for an invalid or expired reset OTP', async () => {
    usePasswordResetStore.getState().setEmail('user@example.com');
    jest.spyOn(AuthApi, 'verifyResetOtp').mockRejectedValue({
      statusCode: 400,
      message: 'Mã OTP không hợp lệ hoặc đã hết hạn',
    });
    render(<VerifyResetOtpScreen />);
    fireEvent.changeText(screen.getByTestId('verify-reset-otp-input'), '123456');
    fireEvent.press(screen.getByTestId('verify-reset-otp-submit-button'));

    expect(await screen.findByText('Mã OTP không hợp lệ hoặc đã hết hạn.')).toBeOnTheScreen();
    expect(screen.queryByText(/còn \d+ lần/i)).toBeNull();
  });

  it('resends OTP through the generic forgot-password endpoint and handles rate limits', async () => {
    usePasswordResetStore.getState().setEmail('user@example.com');
    const resend = jest.spyOn(AuthApi, 'forgotPassword').mockRejectedValue({ statusCode: 429 });
    try {
      jest.useFakeTimers();
      render(<VerifyResetOtpScreen />);

      React.act(() => {
        jest.advanceTimersByTime(60_000);
      });
    }
    finally {
      jest.useRealTimers();
    }

    fireEvent.press(screen.getByTestId('verify-reset-otp-resend-button'));
    expect(resend).toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(
      await screen.findByText('Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'),
    ).toBeOnTheScreen();
  });

  it('validates password strength and confirmation before submitting', async () => {
    usePasswordResetStore.getState().setResetToken('short-lived-reset-token');
    const reset = jest.spyOn(AuthApi, 'resetPassword').mockResolvedValue({
      statusCode: 200,
      message: 'reset',
      data: null,
    });
    render(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('reset-password-input'), 'weak');
    fireEvent.changeText(screen.getByTestId('reset-password-confirm-input'), 'weak');
    fireEvent.press(screen.getByTestId('reset-password-submit-button'));
    expect(await screen.findByText('Mật khẩu phải có tối thiểu 8 ký tự')).toBeOnTheScreen();
    expect(reset).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('reset-password-input'), 'StrongPass1!');
    fireEvent.changeText(screen.getByTestId('reset-password-confirm-input'), 'Different1!');
    fireEvent.press(screen.getByTestId('reset-password-submit-button'));
    expect(await screen.findByText('Mật khẩu xác nhận không trùng khớp')).toBeOnTheScreen();
    expect(reset).not.toHaveBeenCalled();
  });

  it('resets the password, clears the in-memory token, and returns to login', async () => {
    usePasswordResetStore.getState().setResetToken('short-lived-reset-token');
    const reset = jest.spyOn(AuthApi, 'resetPassword').mockResolvedValue({
      statusCode: 200,
      message: 'reset',
      data: null,
    });
    render(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('reset-password-input'), 'StrongPass1!');
    fireEvent.changeText(screen.getByTestId('reset-password-confirm-input'), 'StrongPass1!');
    fireEvent.press(screen.getByTestId('reset-password-submit-button'));
    await waitFor(() => {
      expect(reset).toHaveBeenCalledWith({ resetToken: 'short-lived-reset-token', newPassword: 'StrongPass1!' });
      expect(usePasswordResetStore.getState().resetToken).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(auth)/login',
        params: { reset: 'true' },
      });
    });
  });

  it('clears the in-memory reset token when the user exits the flow', () => {
    usePasswordResetStore.getState().setEmail('user@example.com');
    usePasswordResetStore.getState().setResetToken('short-lived-reset-token');
    render(<ResetPasswordScreen />);

    fireEvent.press(screen.getByTestId('reset-password-cancel'));
    expect(usePasswordResetStore.getState().email).toBe('');
    expect(usePasswordResetStore.getState().resetToken).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });
});
