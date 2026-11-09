import * as React from 'react';
import { RouteNames } from '@/constants/route-names';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { CustomerSettingsScreen } from '../screens/customer-settings-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

jest.mock('@/features/notifications/hooks/use-notifications', () => ({
  useNotificationPreferences: () => ({
    data: {
      pushEnabled: true,
      inAppEnabled: true,
      emailEnabled: false,
    },
    isLoading: false,
  }),
  useUpdateNotificationPreferences: () => ({
    mutate: jest.fn(),
  }),
}));

describe('customerSettingsScreen - Interactive Styling & Behavior (TASK-08)', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      activeMode: null,
      isAuthenticated: false,
      isHydrated: true,
      isLoading: false,
      error: null,
      hydrationError: null,
    });
  });

  it('renders settings screen with options and no active background on change password row', () => {
    render(<CustomerSettingsScreen />);

    expect(screen.getByText('Cài đặt')).toBeOnTheScreen();
    expect(screen.getByText('Tùy chọn tài khoản & bảo mật')).toBeOnTheScreen();

    const changePasswordBtn = screen.getByTestId('settings-change-password-btn');
    expect(changePasswordBtn).toBeOnTheScreen();

    // Verify no active background color when pressed/held (TASK-03)
    expect(changePasswordBtn.props.className).not.toContain('active:bg-');

    // Verify navigation on press
    fireEvent.press(changePasswordBtn);
    expect(mockPush).toHaveBeenCalledWith(RouteNames.AUTH_CHANGE_PASSWORD);
  });

  it('navigates back when pressing back button in AppBar', () => {
    render(<CustomerSettingsScreen />);

    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('renders notification and biometrics toggle switches with correct initial values', () => {
    render(<CustomerSettingsScreen />);

    expect(screen.getByTestId('settings-biometrics-switch')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-push-switch')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-inapp-switch')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-email-switch')).toBeOnTheScreen();

    // Biometrics switch can be toggled
    const bioSwitch = screen.getByTestId('settings-biometrics-switch');
    expect(bioSwitch.props.value).toBe(true);
    fireEvent(bioSwitch, 'valueChange', false);
    expect(bioSwitch.props.value).toBe(false);
  });

  it('preserves red warning styling on Logout button and handles confirmation dialog', async () => {
    const mockLogout = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: {
        id: 'cust-1',
        phone: '0912345678',
        email: 'cust@handygo.vn',
        roles: ['Customer'],
        permissions: [],
      },
      isAuthenticated: true,
      activeMode: 'Customer',
      logout: mockLogout,
    });

    render(<CustomerSettingsScreen />);

    const logoutBtn = screen.getByTestId('settings-logout-btn');
    expect(logoutBtn).toBeOnTheScreen();

    // Verify danger button styling is preserved as red (not converted to amber)
    expect(logoutBtn.props.className).toContain('border-red-200');
    expect(logoutBtn.props.className).toContain('bg-red-50/50');
    expect(logoutBtn.props.className).not.toContain('amber');

    // Trigger logout modal
    fireEvent.press(logoutBtn);
    expect(screen.getByTestId('logout-confirm-modal')).toBeOnTheScreen();
    expect(screen.getByText('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản HandyGo không?')).toBeOnTheScreen();

    // Cancel modal
    const cancelBtn = screen.getByTestId('logout-cancel-btn');
    fireEvent.press(cancelBtn);

    // Reopen and confirm logout
    fireEvent.press(logoutBtn);
    const confirmBtn = screen.getByTestId('logout-confirm-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().guestRole).toBe('Customer');
      expect(mockReplace).toHaveBeenCalledWith(RouteNames.CUSTOMER_HOME);
    });
  });
});
