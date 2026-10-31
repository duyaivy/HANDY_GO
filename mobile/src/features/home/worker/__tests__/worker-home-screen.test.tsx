import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { useLocalSearchParams } from 'expo-router';
import { WorkerBiddingApi } from '@/features/bidding/api/worker-bidding.api';
import { WorkerHomeScreen } from '../screens/worker-home-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace, setParams: mockSetParams, back: jest.fn(), canGoBack: jest.fn() };

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(() => mockRouter),
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

jest.mock('@/features/bidding/api/worker-bidding.api', () => ({
  WorkerBiddingApi: {
    getServiceRequest: jest.fn(),
    getRoundStatus: jest.fn().mockResolvedValue({ status: 'open', isExpired: false, bidCount: 1, timeRemainingSeconds: 300 }),
    getMyBids: jest.fn().mockResolvedValue([]),
    submitBid: jest.fn(),
    reviseBid: jest.fn(),
    withdrawBid: jest.fn(),
  },
}));

afterEach(() => {
  cleanup();
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

  it('renders authenticated worker home screen when logged in', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'w-1', phone: '0988776655', email: 'worker@handygo.vn', roles: ['Worker'], permissions: [] },
    });
    render(<WorkerHomeScreen />);
    expect(screen.getByTestId('home-worker-screen')).toBeOnTheScreen();
    expect(screen.getByText('Việc làm xung quanh bạn')).toBeOnTheScreen();
    expect(screen.getByText('Nhận việc')).toBeOnTheScreen();
    expect(screen.getByText('App Khách ⇄')).toBeOnTheScreen();
    expect(screen.queryByTestId('worker-online-toggle')).toBeNull();
  });

  it('automatically opens bidding modal when navigated with requestId query param', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ requestId: 'req-deep-123' });
    jest.mocked(WorkerBiddingApi.getServiceRequest).mockResolvedValueOnce({
      id: 'req-deep-123',
      requestCode: 'REQ-123',
      description: 'Sửa đường ống nước bị vỡ',
      addressText: '123 Lê Duẩn, Đà Nẵng',
      status: 'open_for_bidding',
      createdAt: '2026-10-31T10:00:00Z',
    } as any);

    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'w-1', phone: '0988776655', email: 'worker@handygo.vn', roles: ['Worker'], permissions: [] },
    });

    render(<WorkerHomeScreen />);

    expect(await screen.findByText('Gửi báo giá dịch vụ')).toBeOnTheScreen();
    expect(screen.getByText('Sửa đường ống nước bị vỡ')).toBeOnTheScreen();
    expect(screen.getByText('Địa chỉ: 123 Lê Duẩn, Đà Nẵng')).toBeOnTheScreen();
  });
});
