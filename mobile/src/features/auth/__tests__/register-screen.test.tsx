/* eslint-disable max-lines-per-function */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { RegisterScreen } from '../screens/register-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  })),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('registerScreen', () => {
  it('renders all form fields and submit button', () => {
    render(<RegisterScreen />);
    expect(screen.getByTestId('auth-register-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('role-customer-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('role-worker-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('register-fullname-input')).toBeOnTheScreen();
    expect(screen.getByTestId('register-phone-input')).toBeOnTheScreen();
    expect(screen.getByTestId('register-email-input')).toBeOnTheScreen();
    expect(screen.getByTestId('register-password-input')).toBeOnTheScreen();
    expect(screen.getByTestId('register-confirm-password-input')).toBeOnTheScreen();
    expect(screen.getByTestId('register-submit-button')).toBeOnTheScreen();
  });

  it('validates empty inputs on submit', async () => {
    render(<RegisterScreen />);
    fireEvent.press(screen.getByTestId('register-submit-button'));

    expect(await screen.findByText('Họ và tên phải có tối thiểu 2 ký tự')).toBeOnTheScreen();
    expect(await screen.findByText('Vui lòng nhập số điện thoại')).toBeOnTheScreen();
    expect(await screen.findByText('Vui lòng nhập địa chỉ email')).toBeOnTheScreen();
    expect(await screen.findByText('Vui lòng nhập mật khẩu')).toBeOnTheScreen();
    expect(await screen.findByText('Vui lòng xác nhận mật khẩu')).toBeOnTheScreen();
  });

  it('validates password confirmation match', async () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByTestId('register-fullname-input'), 'Nguyen Van A');
    fireEvent.changeText(screen.getByTestId('register-phone-input'), '0912345678');
    fireEvent.changeText(screen.getByTestId('register-email-input'), 'customer@example.com');
    fireEvent.changeText(screen.getByTestId('register-password-input'), 'Password123');
    fireEvent.changeText(screen.getByTestId('register-confirm-password-input'), 'DifferentPassword');
    fireEvent.press(screen.getByTestId('register-submit-button'));

    expect(await screen.findByText('Mật khẩu xác nhận không trùng khớp')).toBeOnTheScreen();
  });

  it('submits valid registration with Customer role by default', async () => {
    const registerSpy = jest.spyOn(AuthApi, 'register').mockResolvedValue({
      statusCode: 201,
      message: 'Đăng ký thành công',
      data: {
        userId: 'user-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        verificationInstructions: 'Nhập mã OTP',
      },
    });

    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByTestId('register-fullname-input'), 'Nguyen Van A');
    fireEvent.changeText(screen.getByTestId('register-phone-input'), '0912345678');
    fireEvent.changeText(screen.getByTestId('register-email-input'), 'customer@example.com');
    fireEvent.changeText(screen.getByTestId('register-password-input'), 'Password123');
    fireEvent.changeText(screen.getByTestId('register-confirm-password-input'), 'Password123');
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith({
        fullName: 'Nguyen Van A',
        phone: '0912345678',
        email: 'customer@example.com',
        password: 'Password123',
        role: 'Customer',
      });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/otp',
        params: {
          email: 'customer@example.com',
          phone: '0912345678',
          emailMasked: undefined,
          resendAvailableAt: undefined,
        },
      });
    });
  });

  it('submits valid registration with Worker role when selected', async () => {
    const registerSpy = jest.spyOn(AuthApi, 'register').mockResolvedValue({
      statusCode: 201,
      message: 'Đăng ký thành công',
      data: {
        userId: 'worker-1',
        phone: '+84912345679',
        email: 'worker@example.com',
        verificationInstructions: 'Nhập mã OTP',
      },
    });

    render(<RegisterScreen />);
    fireEvent.press(screen.getByTestId('role-worker-btn'));
    fireEvent.changeText(screen.getByTestId('register-fullname-input'), 'Tho Sua Chua');
    fireEvent.changeText(screen.getByTestId('register-phone-input'), '0912345679');
    fireEvent.changeText(screen.getByTestId('register-email-input'), 'worker@example.com');
    fireEvent.changeText(screen.getByTestId('register-password-input'), 'Password123');
    fireEvent.changeText(screen.getByTestId('register-confirm-password-input'), 'Password123');
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith({
        fullName: 'Tho Sua Chua',
        phone: '0912345679',
        email: 'worker@example.com',
        password: 'Password123',
        role: 'Worker',
      });
    });
  });

  it('displays error when email or phone is duplicated (409 Conflict)', async () => {
    jest.spyOn(AuthApi, 'register').mockRejectedValue({
      statusCode: 409,
      code: 'PHONE_ALREADY_EXISTS',
      message: 'Số điện thoại đã được đăng ký',
    });

    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByTestId('register-fullname-input'), 'Nguyen Van A');
    fireEvent.changeText(screen.getByTestId('register-phone-input'), '0912345678');
    fireEvent.changeText(screen.getByTestId('register-email-input'), 'customer@example.com');
    fireEvent.changeText(screen.getByTestId('register-password-input'), 'Password123');
    fireEvent.changeText(screen.getByTestId('register-confirm-password-input'), 'Password123');
    fireEvent.press(screen.getByTestId('register-submit-button'));

    expect(await screen.findByText('Số điện thoại đã được đăng ký. Vui lòng đăng nhập.')).toBeOnTheScreen();
  });
});
