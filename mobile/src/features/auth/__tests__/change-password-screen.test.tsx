/* eslint-disable max-lines-per-function */
/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { ChangePasswordScreen } from '../screens/change-password-screen';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('changePasswordScreen', () => {
  it('renders all 3 password inputs, AppBar title, and action buttons', () => {
    render(<ChangePasswordScreen />);

    expect(screen.getByText('Đổi mật khẩu')).toBeOnTheScreen();
    expect(screen.getByTestId('change-password-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('old-password-input')).toBeOnTheScreen();
    expect(screen.getByTestId('new-password-input')).toBeOnTheScreen();
    expect(screen.getByTestId('confirm-new-password-input')).toBeOnTheScreen();
    expect(screen.getByTestId('submit-change-password-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('cancel-change-password-btn')).toBeOnTheScreen();
  });

  it('toggles password visibility for all three inputs', () => {
    render(<ChangePasswordScreen />);

    const oldToggle = screen.getByTestId('old-password-toggle');
    const newToggle = screen.getByTestId('new-password-toggle');
    const confirmToggle = screen.getByTestId('confirm-new-password-toggle');

    // Initially all show 'Hiện'
    expect(screen.getAllByText('Hiện').length).toBe(3);

    fireEvent.press(oldToggle);
    fireEvent.press(newToggle);
    fireEvent.press(confirmToggle);

    // Now all show 'Ẩn'
    expect(screen.getAllByText('Ẩn').length).toBe(3);
  });

  it('shows error when old password is empty', () => {
    render(<ChangePasswordScreen />);

    fireEvent.press(screen.getByTestId('submit-change-password-btn'));
    expect(screen.getByText('Vui lòng nhập mật khẩu hiện tại')).toBeOnTheScreen();
  });

  it('shows error when new password is empty or invalid', () => {
    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByTestId('old-password-input'), 'OldPass@123');
    fireEvent.press(screen.getByTestId('submit-change-password-btn'));
    expect(screen.getByText('Vui lòng nhập mật khẩu mới')).toBeOnTheScreen();

    // Less than 8 characters
    fireEvent.changeText(screen.getByTestId('new-password-input'), 'Short1!');
    fireEvent.press(screen.getByTestId('submit-change-password-btn'));
    expect(screen.getByText('Mật khẩu mới phải có tối thiểu 8 ký tự')).toBeOnTheScreen();

    // Missing special character
    fireEvent.changeText(screen.getByTestId('new-password-input'), 'NoSpecial123');
    fireEvent.press(screen.getByTestId('submit-change-password-btn'));
    expect(screen.getByText('Mật khẩu mới cần có chữ hoa, chữ thường, chữ số và ký tự đặc biệt')).toBeOnTheScreen();
  });

  it('shows error when new password matches old password', () => {
    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByTestId('old-password-input'), 'SamePassword@123');
    fireEvent.changeText(screen.getByTestId('new-password-input'), 'SamePassword@123');
    fireEvent.changeText(screen.getByTestId('confirm-new-password-input'), 'SamePassword@123');

    fireEvent.press(screen.getByTestId('submit-change-password-btn'));
    expect(screen.getByText('Mật khẩu mới không được trùng với mật khẩu cũ')).toBeOnTheScreen();
  });

  it('shows error when confirm password does not match', () => {
    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByTestId('old-password-input'), 'OldPass@123');
    fireEvent.changeText(screen.getByTestId('new-password-input'), 'NewStrongPass@123');
    fireEvent.changeText(screen.getByTestId('confirm-new-password-input'), 'DifferentPass@123');

    fireEvent.press(screen.getByTestId('submit-change-password-btn'));
    expect(screen.getByText('Mật khẩu xác nhận không trùng khớp')).toBeOnTheScreen();
  });

  it('successfully submits valid passwords and displays success message', async () => {
    const changePasswordSpy = jest.spyOn(AuthApi, 'changePassword').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: null,
    });

    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByTestId('old-password-input'), 'OldPass@123');
    fireEvent.changeText(screen.getByTestId('new-password-input'), 'NewPass@2026');
    fireEvent.changeText(screen.getByTestId('confirm-new-password-input'), 'NewPass@2026');

    fireEvent.press(screen.getByTestId('submit-change-password-btn'));

    await waitFor(() => {
      expect(changePasswordSpy).toHaveBeenCalledWith({
        oldPassword: 'OldPass@123',
        newPassword: 'NewPass@2026',
      });
      expect(screen.getByText('Đổi mật khẩu thành công!')).toBeOnTheScreen();
    });
  });

  it('handles API rejection with error message', async () => {
    jest.spyOn(AuthApi, 'changePassword').mockRejectedValue({
      statusCode: 400,
      message: 'Mật khẩu hiện tại không chính xác',
    });

    render(<ChangePasswordScreen />);

    fireEvent.changeText(screen.getByTestId('old-password-input'), 'WrongOldPass@123');
    fireEvent.changeText(screen.getByTestId('new-password-input'), 'NewPass@2026');
    fireEvent.changeText(screen.getByTestId('confirm-new-password-input'), 'NewPass@2026');

    fireEvent.press(screen.getByTestId('submit-change-password-btn'));

    await waitFor(() => {
      expect(screen.getByText('Mật khẩu hiện tại không chính xác')).toBeOnTheScreen();
    });
  });

  it('navigates back when pressing cancel button', () => {
    render(<ChangePasswordScreen />);

    fireEvent.press(screen.getByTestId('cancel-change-password-btn'));
    expect(mockBack).toHaveBeenCalled();
  });
});
