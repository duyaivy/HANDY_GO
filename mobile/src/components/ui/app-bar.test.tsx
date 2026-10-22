/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { AppBar } from './app-bar';

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

describe('appBar component', () => {
  describe('stack mode', () => {
    it('should render correctly in default stack mode with title', () => {
      render(<AppBar mode="stack" title="Chi tiết đơn hàng" subtitle="Mã đơn: #12345" />);

      expect(screen.getByTestId('app-bar')).toBeOnTheScreen();
      expect(screen.getByTestId('app-bar-title')).toHaveTextContent('Chi tiết đơn hàng');
      expect(screen.getByTestId('app-bar-subtitle')).toHaveTextContent('Mã đơn: #12345');
      expect(screen.getByTestId('app-bar-back-btn')).toBeOnTheScreen();
    });

    it('should call default router.back when onBack is not provided', () => {
      render(<AppBar mode="stack" title="Tiêu đề" />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('should call custom onBack handler when provided', () => {
      const customBack = jest.fn();
      render(<AppBar mode="stack" title="Tiêu đề" onBack={customBack} />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(customBack).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('should hide back button when hideBackButton is true', () => {
      render(<AppBar mode="stack" title="Tiêu đề" hideBackButton />);

      expect(screen.queryByTestId('app-bar-back-btn')).toBeNull();
    });

    it('should render support button and call onPressSupport when provided', () => {
      const handleSupport = jest.fn();
      render(<AppBar mode="stack" title="Tiêu đề" onPressSupport={handleSupport} />);

      const supportBtn = screen.getByTestId('app-bar-support-btn');
      expect(supportBtn).toBeOnTheScreen();
      fireEvent.press(supportBtn);
      expect(handleSupport).toHaveBeenCalledTimes(1);
    });
  });

  describe('home mode', () => {
    it('should render brand logo and role label in home mode', () => {
      render(<AppBar mode="home" role="Customer" />);

      expect(screen.getByTestId('app-bar')).toBeOnTheScreen();
      expect(screen.getByText('Khách hàng')).toBeOnTheScreen();
      expect(screen.getByTestId('app-bar-notification-btn')).toBeOnTheScreen();
    });

    it('should render worker label when role is Worker', () => {
      render(<AppBar mode="home" role="Worker" />);

      expect(screen.getByText('Đối tác Thợ')).toBeOnTheScreen();
    });

    it('should render role switcher chip and handle onPress', () => {
      const handleSwitchRole = jest.fn();
      render(
        <AppBar
          mode="home"
          role="Customer"
          showRoleSwitcher
          onSwitchRole={handleSwitchRole}
        />,
      );

      const switchChip = screen.getByTestId('app-bar-role-switch-chip');
      expect(switchChip).toBeOnTheScreen();
      expect(screen.getByText('App Khách')).toBeOnTheScreen();

      fireEvent.press(switchChip);
      expect(handleSwitchRole).toHaveBeenCalledTimes(1);
    });

    it('should display notification badge when count is greater than 0', () => {
      render(<AppBar mode="home" notificationCount={5} />);

      expect(screen.getByTestId('app-bar-notification-badge')).toBeOnTheScreen();
      expect(screen.getByText('5')).toBeOnTheScreen();
    });

    it('should display 99+ when notification count exceeds 99', () => {
      render(<AppBar mode="home" notificationCount={150} />);

      expect(screen.getByText('99+')).toBeOnTheScreen();
    });

    it('should call onPressNotification when bell is pressed', () => {
      const handleNotification = jest.fn();
      render(<AppBar mode="home" onPressNotification={handleNotification} />);

      const notifBtn = screen.getByTestId('app-bar-notification-btn');
      fireEvent.press(notifBtn);
      expect(handleNotification).toHaveBeenCalledTimes(1);
    });
  });
});
