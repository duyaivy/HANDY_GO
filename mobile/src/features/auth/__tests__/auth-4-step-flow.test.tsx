import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { CompleteProfileScreen } from '../screens/complete-profile-screen';
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
  jest.restoreAllMocks();
  useAuthStore.getState().setUser(null);
  useAuthStore.getState().setGuestRole(null);
  useAuthFlowStore.getState().resetFlow();
});

describe('auth registration verification and role onboarding', () => {
  it('verifies a 6-digit OTP and enters the customer app', async () => {
    useAuthFlowStore.getState().setPhone('0912345678');
    expect(useAuthFlowStore.getState().phone).toBe('0912345678');

    jest.spyOn(AuthApi, 'verifyOtp').mockResolvedValue({
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

    const { unmount: unmountOtp } = render(<OtpVerificationScreen />);
    expect(screen.getByTestId('otp-countdown-circle')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    fireEvent.press(screen.getByTestId('otp-submit-btn'));

    await waitFor(() => {
      expect(AuthApi.verifyOtp).toHaveBeenCalledWith({
        challengeId: undefined,
        email: undefined,
        phone: '0912345678',
        otp: '123456',
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(mockReplace).toHaveBeenCalledWith('/customer');
    });

    unmountOtp();
  });

  it('completes a worker profile and routes to the worker app', async () => {
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
