import * as React from 'react';
import { Alert } from 'react-native';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { ChangeEmailModal } from '../change-email-modal';
import { EditProfileModal } from '../edit-profile-modal';

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('editProfileModal', () => {
  it('renders initial values and handles updating profile successfully', async () => {
    const onCloseMock = jest.fn();
    const onSuccessMock = jest.fn();
    const updateSpy = jest.spyOn(AuthApi, 'updateProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'user-1',
        fullName: 'Nguyễn Văn Mới',
        avatarUrl: null,
        status: 'active',
        customerProfile: {
          id: 'cust-1',
          userId: 'user-1',
          bio: 'Kinh nghiệm 5 năm sửa ống nước',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workerProfile: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(
      <EditProfileModal
        visible={true}
        initialFullName="Nguyễn Văn A"
        initialBio="Thợ sửa chữa"
        onClose={onCloseMock}
        onSuccess={onSuccessMock}
      />,
    );

    expect(screen.getByTestId('edit-profile-modal')).toBeOnTheScreen();
    expect(screen.getByTestId('edit-profile-name-input')).toHaveProp('value', 'Nguyễn Văn A');
    expect(screen.getByTestId('edit-profile-bio-input')).toHaveProp('value', 'Thợ sửa chữa');

    fireEvent.changeText(screen.getByTestId('edit-profile-name-input'), 'Nguyễn Văn Mới');
    fireEvent.changeText(screen.getByTestId('edit-profile-bio-input'), 'Kinh nghiệm 5 năm sửa ống nước');
    fireEvent.press(screen.getByTestId('edit-profile-save-btn'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        fullName: 'Nguyễn Văn Mới',
        bio: 'Kinh nghiệm 5 năm sửa ống nước',
      });
      expect(onSuccessMock).toHaveBeenCalledWith({
        fullName: 'Nguyễn Văn Mới',
        bio: 'Kinh nghiệm 5 năm sửa ống nước',
      });
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('validates minimum name length', async () => {
    render(
      <EditProfileModal
        visible={true}
        initialFullName="A"
        initialBio=""
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByTestId('edit-profile-name-input'), ' ');
    fireEvent.press(screen.getByTestId('edit-profile-save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-profile-error')).toHaveTextContent('Họ và tên phải có ít nhất 2 ký tự');
    });
  });
});

describe('changeEmailModal', () => {
  it('progresses through step 1 (request OTP) and step 2 (confirm OTP) successfully', async () => {
    const onCloseMock = jest.fn();
    const onSuccessMock = jest.fn();

    const requestSpy = jest.spyOn(AuthApi, 'requestChangeEmail').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        newEmail: 'newemail@example.com',
        cooldownSeconds: 60,
      },
    });

    const confirmSpy = jest.spyOn(AuthApi, 'confirmChangeEmail').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        email: 'newemail@example.com',
        verifiedAt: new Date().toISOString(),
      },
    });

    render(
      <ChangeEmailModal
        visible={true}
        currentEmail="current@example.com"
        onClose={onCloseMock}
        onSuccess={onSuccessMock}
      />,
    );

    expect(screen.getByTestId('change-email-modal')).toBeOnTheScreen();
    expect(screen.getByText('current@example.com')).toBeOnTheScreen();

    // Step 1: Input new email
    fireEvent.changeText(screen.getByTestId('change-email-input'), 'newemail@example.com');
    fireEvent.press(screen.getByTestId('change-email-submit-step1-btn'));

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith({ newEmail: 'newemail@example.com' });
      expect(screen.getByTestId('change-email-otp-input')).toBeOnTheScreen();
    });

    // Step 2: Input 6-digit OTP
    fireEvent.changeText(screen.getByTestId('change-email-otp-input'), '123456');
    fireEvent.press(screen.getByTestId('change-email-submit-step2-btn'));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith({
        newEmail: 'newemail@example.com',
        otp: '123456',
      });
      expect(onSuccessMock).toHaveBeenCalledWith('newemail@example.com');
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('validates invalid email format and duplicate email', async () => {
    render(
      <ChangeEmailModal
        visible={true}
        currentEmail="current@example.com"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    // Invalid format
    fireEvent.changeText(screen.getByTestId('change-email-input'), 'invalid-email');
    fireEvent.press(screen.getByTestId('change-email-submit-step1-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('change-email-error')).toHaveTextContent('Địa chỉ email không đúng định dạng');
    });

    // Same email
    fireEvent.changeText(screen.getByTestId('change-email-input'), 'current@example.com');
    fireEvent.press(screen.getByTestId('change-email-submit-step1-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('change-email-error')).toHaveTextContent('Email mới không được trùng với email hiện tại');
    });
  });
});
