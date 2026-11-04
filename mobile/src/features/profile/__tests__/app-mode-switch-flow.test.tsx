/* eslint-disable react-compiler/react-compiler, testing-library/no-unnecessary-act */
import * as React from 'react';
import { View } from 'react-native';
import { act, cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { AppModeSwitchOverlay } from '../components/app-mode-switch-overlay';
import { AppSwitchCard } from '../components/app-switch-card';
import { useAppModeSwitch } from '../hooks/use-app-mode-switch';
import { useModeSwitchStore } from '../stores/use-mode-switch-store';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    replace: mockReplace,
    push: mockPush,
    back: jest.fn(),
  })),
}));

describe('aPK Mode Switch Flow & Root Overlay Integration (TASK-07)', () => {
  const dualUser = {
    id: 'user-dual-1',
    phone: '0987654321',
    email: 'dual@handygo.vn',
    roles: ['Customer', 'Worker'],
    permissions: [],
  };

  const customerOnlyUser = {
    id: 'user-cust-only',
    phone: '0911223344',
    email: 'cust@handygo.vn',
    roles: ['Customer'],
    permissions: [],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    useModeSwitchStore.getState().reset();
    useAuthStore.setState({
      user: dualUser,
      isAuthenticated: true,
      activeMode: 'Customer',
      guestRole: null,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function TestScreenWithOverlay({ currentMode }: { currentMode: 'Customer' | 'Worker' }) {
    const { switchToMode } = useAppModeSwitch();
    return (
      <View>
        <AppSwitchCard
          currentMode={currentMode}
          roles={useAuthStore.getState().user?.roles || []}
          onSwitch={switchToMode}
        />
        <AppModeSwitchOverlay />
      </View>
    );
  }

  it('switches Customer -> Worker: displays overlay, updates state, and navigates once', () => {
    render(<TestScreenWithOverlay currentMode="Customer" />);

    const switchBtn = screen.getByTestId('switch-to-worker-btn');
    fireEvent.press(switchBtn);

    // Overlay displays immediately
    expect(screen.getByTestId('app-mode-switch-overlay')).toBeOnTheScreen();
    expect(screen.getByText('Đang chuyển sang giao diện Thợ...')).toBeOnTheScreen();
    expect(screen.getByTestId('mode-switch-spinner')).toBeOnTheScreen();

    // Mode updated and router called exactly once
    expect(useAuthStore.getState().activeMode).toBe('Worker');
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/worker');

    // Finish transition (e.g. WorkerHomeScreen onLayout)
    act(() => {
      act(() => {
        useModeSwitchStore.getState().finishSwitch();
      });
    });
    expect(screen.queryByTestId('app-mode-switch-overlay')).toBeNull();
  });

  it('switches Worker -> Customer: displays overlay with customer message and navigates once', () => {
    useAuthStore.setState({ activeMode: 'Worker' });
    render(<TestScreenWithOverlay currentMode="Worker" />);

    const switchBtn = screen.getByTestId('switch-to-customer-btn');
    fireEvent.press(switchBtn);

    expect(screen.getByTestId('app-mode-switch-overlay')).toBeOnTheScreen();
    expect(screen.getByText('Đang chuyển sang giao diện Khách hàng...')).toBeOnTheScreen();

    expect(useAuthStore.getState().activeMode).toBe('Customer');
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/customer');

    act(() => {
      act(() => {
        useModeSwitchStore.getState().finishSwitch();
      });
    });
    expect(screen.queryByTestId('app-mode-switch-overlay')).toBeNull();
  });

  it('prevents spam click: disables button and sends only 1 navigation event', () => {
    render(<TestScreenWithOverlay currentMode="Customer" />);

    const switchBtn = screen.getByTestId('switch-to-worker-btn');
    fireEvent.press(switchBtn);
    fireEvent.press(switchBtn);
    fireEvent.press(switchBtn);

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('redirects unauthorized customer (missing Worker role) to switch-to-worker screen without activating Worker mode', () => {
    useAuthStore.setState({
      user: customerOnlyUser,
      isAuthenticated: true,
      activeMode: 'Customer',
    });

    function TestDirectSwitch() {
      const { switchToMode } = useAppModeSwitch();
      return (
        <View>
          <AppModeSwitchOverlay />
          <View testID="trigger-btn" onTouchEnd={() => switchToMode('Worker')} />
        </View>
      );
    }

    render(<TestDirectSwitch />);
    fireEvent(screen.getByTestId('trigger-btn'), 'touchEnd');

    // Should redirect to switch-to-worker screen instead of activating Worker mode
    expect(mockPush).toHaveBeenCalledWith('/customer/switch-to-worker');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().activeMode).toBe('Customer');
    expect(screen.queryByTestId('app-mode-switch-overlay')).toBeNull();
  });

  it('supports unauthenticated guest mode switching seamlessly', () => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      guestRole: 'Customer',
      activeMode: 'Customer',
    });

    function TestGuestSwitch() {
      const { switchToMode } = useAppModeSwitch();
      return (
        <View>
          <AppModeSwitchOverlay />
          <View testID="to-worker" onTouchEnd={() => switchToMode('Worker')} />
          <View testID="to-customer" onTouchEnd={() => switchToMode('Customer')} />
        </View>
      );
    }

    render(<TestGuestSwitch />);

    // 1. Guest -> Worker
    fireEvent(screen.getByTestId('to-worker'), 'touchEnd');
    expect(useAuthStore.getState().guestRole).toBe('Worker');
    expect(useAuthStore.getState().activeMode).toBe('Worker');
    expect(mockReplace).toHaveBeenCalledWith('/worker');

    act(() => {
      useModeSwitchStore.getState().finishSwitch();
    });

    // 2. Guest -> Customer
    fireEvent(screen.getByTestId('to-customer'), 'touchEnd');
    expect(useAuthStore.getState().guestRole).toBe('Customer');
    expect(useAuthStore.getState().activeMode).toBe('Customer');
    expect(mockReplace).toHaveBeenCalledWith('/customer');
  });

  it('triggers watchdog after 10s of being stuck, showing error UI and allowing revert', () => {
    render(<TestScreenWithOverlay currentMode="Customer" />);

    const switchBtn = screen.getByTestId('switch-to-worker-btn');
    fireEvent.press(switchBtn);

    expect(screen.getByTestId('mode-switch-spinner')).toBeOnTheScreen();

    // Fast-forward 10s watchdog timer
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Watchdog error UI displays
    expect(screen.getByText('Chuyển ứng dụng không thành công')).toBeOnTheScreen();
    expect(screen.getByText('Không thể chuyển ứng dụng vào lúc này. Vui lòng thử lại.')).toBeOnTheScreen();
    expect(screen.getByTestId('mode-switch-retry-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('mode-switch-cancel-btn')).toBeOnTheScreen();

    // Press "Quay về" (revert)
    const cancelBtn = screen.getByTestId('mode-switch-cancel-btn');
    fireEvent.press(cancelBtn);

    // Reverted back to Customer mode, navigated, and overlay closed
    expect(useAuthStore.getState().activeMode).toBe('Customer');
    expect(mockReplace).toHaveBeenLastCalledWith('/customer');
    expect(screen.queryByTestId('app-mode-switch-overlay')).toBeNull();
  });

  it('triggers watchdog after 10s and allows retry', () => {
    render(<TestScreenWithOverlay currentMode="Customer" />);

    const switchBtn = screen.getByTestId('switch-to-worker-btn');
    fireEvent.press(switchBtn);

    // Fast-forward 10s
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(screen.getByTestId('mode-switch-retry-btn')).toBeOnTheScreen();

    // Press "Thử lại"
    mockReplace.mockClear();
    fireEvent.press(screen.getByTestId('mode-switch-retry-btn'));

    expect(screen.getByTestId('mode-switch-spinner')).toBeOnTheScreen();
    expect(mockReplace).toHaveBeenCalledWith('/worker');
  });
});
