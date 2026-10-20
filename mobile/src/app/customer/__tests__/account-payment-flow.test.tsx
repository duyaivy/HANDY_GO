/* eslint-disable max-lines-per-function */
/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { WorkerHomeScreen } from '@/features/home/worker';
import {
  CustomerLinkAccountScreen,
  CustomerPaymentScreen,
  CustomerProfileDetailScreen,
  CustomerProfileScreen,
  CustomerSettingsScreen,
  CustomerSwitchToWorkerScreen,
  CustomerTransactionHistoryScreen,
} from '@/features/profile/customer';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: mockBack,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: any) => {
    cb();
  },
}));

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

describe('account, Payment, and Switch to Worker App Navigation Flow', () => {
  describe('luồng A: Payment', () => {
    it('navigates from Tài khoản / Cá nhân to Quản lý thanh toán when pressing Payment', () => {
      render(<CustomerProfileScreen />);

      const paymentItem = screen.getByTestId('profile-payment-item');
      expect(paymentItem).toBeOnTheScreen();
      expect(screen.getByText('Payment')).toBeOnTheScreen();

      fireEvent.press(paymentItem);
      expect(mockPush).toHaveBeenCalledWith('/customer/payment');
    });

    it('renders Quản lý thanh toán skeleton with title and placeholder', () => {
      render(<CustomerPaymentScreen />);

      expect(screen.getByText('Quản lý thanh toán')).toBeOnTheScreen();
      expect(screen.getByText('Payment')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-payment-screen')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
    });

    it('navigates back to Tài khoản / Cá nhân when pressing back button in Quản lý thanh toán', () => {
      render(<CustomerPaymentScreen />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('luồng B: Link account', () => {
    it('navigates from Quản lý thanh toán to Link account when pressing Linked', () => {
      render(<CustomerPaymentScreen />);

      const linkedBtn = screen.getByTestId('payment-linked-btn');
      expect(linkedBtn).toBeOnTheScreen();
      expect(screen.getByText('Linked')).toBeOnTheScreen();

      fireEvent.press(linkedBtn);
      expect(mockPush).toHaveBeenCalledWith('/customer/payment/link-account');
    });

    it('renders Link account skeleton and navigates back to Quản lý thanh toán on Back press', () => {
      render(<CustomerLinkAccountScreen />);

      expect(screen.getByText('Link account')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-link-account-screen')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('luồng C: Transaction history', () => {
    it('navigates from Quản lý thanh toán to Transaction history when pressing "See all >"', () => {
      render(<CustomerPaymentScreen />);

      const seeAllBtn = screen.getByTestId('payment-see-all-transactions-btn');
      expect(seeAllBtn).toBeOnTheScreen();
      expect(screen.getByText('See all >')).toBeOnTheScreen();

      fireEvent.press(seeAllBtn);
      expect(mockPush).toHaveBeenCalledWith('/customer/payment/transaction-history');
    });

    it('renders Transaction history skeleton and navigates back to Quản lý thanh toán on Back press', () => {
      render(<CustomerTransactionHistoryScreen />);

      expect(screen.getByText('Transaction history')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-transaction-history-screen')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('luồng D: Setting', () => {
    it('navigates from Tài khoản / Cá nhân to Setting when pressing Setting', () => {
      render(<CustomerProfileScreen />);

      const settingItem = screen.getByTestId('profile-setting-item');
      expect(settingItem).toBeOnTheScreen();
      expect(screen.getByText('Setting')).toBeOnTheScreen();

      fireEvent.press(settingItem);
      expect(mockPush).toHaveBeenCalledWith('/customer/settings');
    });

    it('renders Setting screen and navigates back to Tài khoản / Cá nhân on Back press', () => {
      render(<CustomerSettingsScreen />);

      expect(screen.getByText('Cài đặt')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-settings-screen')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('luồng E: Profile', () => {
    it('navigates from Tài khoản / Cá nhân to Profile when pressing user info card', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 'user-001',
          phone: '0901234567',
          email: 'user@example.com',
          roles: ['Customer'],
          permissions: [],
        },
      });

      render(<CustomerProfileScreen />);

      const userCard = screen.getByTestId('profile-user-card');
      expect(userCard).toBeOnTheScreen();

      fireEvent.press(userCard);
      expect(mockPush).toHaveBeenCalledWith('/customer/profile-detail');
    });

    it('renders Profile skeleton and navigates back to Tài khoản / Cá nhân on Back press', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 'user-001',
          phone: '0901234567',
          email: 'user@example.com',
          roles: ['Customer'],
          permissions: [],
        },
      });

      render(<CustomerProfileDetailScreen />);

      expect(screen.getByText('Profile')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-profile-detail-screen')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('luồng F: Chuyển sang Worker App', () => {
    it('navigates from Tài khoản / Cá nhân to Switching screen when pressing arrow on Switch to Worker App banner', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 'user-worker',
          phone: '0909999999',
          email: 'worker@example.com',
          roles: ['Customer', 'Worker'],
          permissions: [],
        },
      });

      render(<CustomerProfileScreen />);

      const arrowBtn = screen.getByTestId('switch-to-worker-arrow');
      expect(arrowBtn).toBeOnTheScreen();
      expect(screen.getByText('Switch to Worker App')).toBeOnTheScreen();

      fireEvent.press(arrowBtn);
      expect(mockPush).toHaveBeenCalledWith('/customer/switch-to-worker');
    });

    it('renders Switching to Worker App screen and transitions to Worker Home', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 'user-worker',
          phone: '0909999999',
          email: 'worker@example.com',
          roles: ['Customer', 'Worker'],
          permissions: [],
        },
      });

      render(<CustomerSwitchToWorkerScreen />);

      expect(screen.getByText('Switching to Worker App')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-switch-to-worker-screen')).toBeOnTheScreen();

      const proceedBtn = screen.getByTestId('proceed-to-worker-btn');
      fireEvent.press(proceedBtn);

      expect(mockReplace).toHaveBeenCalledWith('/worker');
      expect(useAuthStore.getState().activeMode).toBe('Worker');
    });

    it('renders Worker Home screen when switching succeeds', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        activeMode: 'Worker',
        user: {
          id: 'user-worker',
          phone: '0909999999',
          email: 'worker@example.com',
          roles: ['Worker'],
          permissions: [],
        },
      });

      render(<WorkerHomeScreen />);

      expect(screen.getByTestId('home-worker-screen')).toBeOnTheScreen();
      expect(screen.getByText('Nhận việc')).toBeOnTheScreen();
    });
  });
});
