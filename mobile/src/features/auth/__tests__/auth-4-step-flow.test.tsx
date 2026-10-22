/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { CompleteProfileScreen } from '../screens/complete-profile-screen';
import { CreatePinScreen } from '../screens/create-pin-screen';
import { OtpVerificationScreen } from '../screens/otp-verification-screen';
import { useAuthFlowStore } from '../use-auth-flow-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(() => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
    })),
    useLocalSearchParams: jest.fn(() => ({})),
    useRootNavigationState: () => ({ key: 'root-key' }),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.getState().setUser(null);
  useAuthStore.getState().setGuestRole(null);
  useAuthFlowStore.getState().resetFlow();
});

describe('auth 4-Step Flow Integration (Giai đoạn 4 - Ảnh 4, 5, 7, 8)', () => {
  it('executes the complete 4-step authentication flow from Phone to App Khách', async () => {
    // -------------------------------------------------------------
    // Bước 1: Khởi tạo thông tin xác thực
    // -------------------------------------------------------------
    useAuthFlowStore.getState().setPhone('0912345678');
    expect(useAuthFlowStore.getState().phone).toBe('0912345678');

    // -------------------------------------------------------------
    // Bước 2: Nhập OTP (Ảnh 5)
    // -------------------------------------------------------------
    const { unmount: unmountOtp } = render(<OtpVerificationScreen />);
    expect(screen.getByTestId('otp-countdown-circle')).toBeOnTheScreen();

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

    unmountOtp();

    // -------------------------------------------------------------
    // Bước 3: Tạo mã PIN 6 số (Ảnh 7)
    // -------------------------------------------------------------
    const { unmount: unmountPin } = render(<CreatePinScreen />);
    ['6', '5', '4', '3', '2', '1'].forEach((digit) => {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`));
    });

    expect(useAuthFlowStore.getState().pin).toBe('654321');
    fireEvent.press(screen.getByTestId('pin-submit-btn'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/complete-profile');
    unmountPin();

    // -------------------------------------------------------------
    // Bước 4: Nhập Họ tên & Hoàn tất (Ảnh 8)
    // -------------------------------------------------------------
    useAuthStore.getState().setGuestRole('Customer');
    const { unmount: unmountProfile } = render(<CompleteProfileScreen />);

    fireEvent.changeText(screen.getByTestId('complete-profile-fullname-input'), 'Lê Khách Hàng');
    fireEvent.press(screen.getByTestId('complete-profile-submit-btn'));

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.roles).toContain('Customer');
      expect(state.activeMode).toBe('Customer');
      expect(mockReplace).toHaveBeenCalledWith('/customer');
    });

    unmountProfile();
  });

  it('executes the 4-step flow and automatically assigns Worker role when browsing as Worker', async () => {
    useAuthStore.getState().setGuestRole('Worker');
    useAuthFlowStore.getState().setPhone('0933221100');

    const { unmount: unmountProfile } = render(<CompleteProfileScreen />);
    fireEvent.changeText(screen.getByTestId('complete-profile-fullname-input'), 'Võ Thợ Sửa Điện');
    fireEvent.press(screen.getByTestId('complete-profile-submit-btn'));

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.roles).toContain('Worker');
      expect(state.activeMode).toBe('Worker');
      expect(mockReplace).toHaveBeenCalledWith('/worker');
    });

    unmountProfile();
  });
});
