import * as React from 'react';

import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerHomeScreen } from '../screens/worker-home-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

describe('workerHomeScreen', () => {
  it('renders WorkerGuestOverview with title, role switch chip, and sticky CTA for unauthenticated guests', () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    render(<WorkerHomeScreen />);
    expect(screen.getByTestId('worker-guest-overview-screen')).toBeOnTheScreen();
    expect(screen.getByText('Nhận việc')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-guest-role-switch-chip')).toBeOnTheScreen();
    expect(screen.getByText('App Khách ⇄')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-guest-cta-bottom')).toBeOnTheScreen();
    expect(screen.getByText('Bắt đầu ngay')).toBeOnTheScreen();
  });

  it('handles worker guest actions: login navigation and role switching', () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    render(<WorkerHomeScreen />);

    // Press start button
    fireEvent.press(screen.getByTestId('worker-guest-start-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');

    // Press bottom CTA
    fireEvent.press(screen.getByTestId('worker-guest-cta-bottom'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');

    // Press switch to customer role chip
    fireEvent.press(screen.getByTestId('worker-guest-role-switch-chip'));
    expect(mockReplace).toHaveBeenCalledWith('/customer');
    expect(useAuthStore.getState().guestRole).toBe('Customer');
  });

  it('renders authenticated worker home screen when logged in', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'w-1', phone: '0988776655', email: 'worker@handygo.vn', roles: ['Worker'], permissions: [] },
    });
    render(<WorkerHomeScreen />);
    expect(screen.getByTestId('home-worker-screen')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
    expect(screen.getByText('Nhận việc')).toBeOnTheScreen();
    expect(screen.getByText('App Khách ⇄')).toBeOnTheScreen();
    expect(screen.queryByTestId('worker-online-toggle')).toBeNull();
  });
});
