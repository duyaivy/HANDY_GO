/* eslint-disable max-lines-per-function */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';

import CustomerNotificationsScreen from '../(tabs)/notifications';
import CustomerAiDiagnosisScreen from '../ai-diagnosis';
import CustomerAskMeScreen from '../ask-me';
import CustomerBookingScreen from '../booking/index';
import CustomerBookingRadarScreen from '../booking/radar';
import CustomerBookingSelectAddressScreen from '../booking/select-address';
import CustomerBookingSelectTimeScreen from '../booking/select-time';
import CustomerBookingSummaryScreen from '../booking/summary';
import CustomerChatScreen from '../chat';
import CustomerFavoritesScreen from '../favorites';
import CustomerHistoryScreen from '../history';
import CustomerOrderQuoteSheetScreen from '../orders/[id]';
import CustomerOrderCancelDialog from '../orders/[id]/cancel-dialog';
import CustomerOrderDetailInfoModal from '../orders/[id]/detail';
import CustomerReferralScreen from '../referral';
import CustomerSearchAddressScreen from '../search-address';
import CustomerServiceDetailScreen from '../services/[id]';
import CustomerSettingsScreen from '../settings';
import CustomerSupportScreen from '../support';
import CustomerWorkerDetailScreen from '../workers/[id]';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: 'demo-001' };

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => mockParams),
}));

jest.mock('@/features/orders/api/orders.api', () => ({
  OrdersApi: {
    createRequest: jest.fn().mockResolvedValue({ data: { id: 'req-001' } }),
    publishRequest: jest.fn().mockResolvedValue({ success: true }),
    getMyRequests: jest.fn().mockResolvedValue({ data: [] }),
    createProposal: jest.fn().mockResolvedValue({ success: true }),
  },
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockParams = { id: 'demo-001' };
});

describe('customer Skeleton & Route Flow', () => {
  describe('customerOrderDetailScreen (orders/[id])', () => {
    it('renders placeholder frame with order id and development notice', () => {
      render(<CustomerOrderQuoteSheetScreen />);

      expect(screen.getByText('Báo giá thợ')).toBeOnTheScreen();
      expect(screen.getByText('Mã đơn: #demo-001')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('orders-customer-detail-screen')).toBeOnTheScreen();
    });

    it('navigates back using app bar back button', () => {
      render(<CustomerOrderQuoteSheetScreen />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerOrderDetailInfoModal (orders/[id]/detail)', () => {
    it('renders modal placeholder frame and handles back navigation', () => {
      render(<CustomerOrderDetailInfoModal />);

      expect(screen.getByText('Chi tiết đơn dịch vụ')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerOrderCancelDialog (orders/[id]/cancel-dialog)', () => {
    it('renders transparent modal dialog with close button', () => {
      render(<CustomerOrderCancelDialog />);

      expect(screen.getByText('Hủy đơn #demo-001')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      const dismissBtn = screen.getByTestId('cancel-dialog-dismiss-btn');
      fireEvent.press(dismissBtn);
      expect(mockBack).toHaveBeenCalled();
    });

    it('closes dialog on close icon press', () => {
      render(<CustomerOrderCancelDialog />);

      const closeIcon = screen.getByTestId('cancel-dialog-close-icon');
      fireEvent.press(closeIcon);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerServiceDetailScreen (services/[id])', () => {
    it('renders service detail placeholder frame with development notice and book now button', () => {
      mockParams = { id: 'srv-01' };
      render(<CustomerServiceDetailScreen />);

      expect(screen.getByText('Chi tiết dịch vụ')).toBeOnTheScreen();
      expect(screen.getByText('Mã dịch vụ: #srv-01')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('service-book-now-btn')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });

    it('navigates to booking flow when pressing Book now button', () => {
      mockParams = { id: 'srv-01' };
      render(<CustomerServiceDetailScreen />);

      const bookNowBtn = screen.getByTestId('service-book-now-btn');
      fireEvent.press(bookNowBtn);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/customer/booking',
        params: { serviceId: 'srv-01' },
      });
    });
  });

  describe('customerBookingScreen (booking/index)', () => {
    it('renders booking placeholder frame with service id parameter and development notice', () => {
      mockParams = { serviceId: 'srv-01' };
      render(<CustomerBookingScreen />);

      expect(screen.getByText('Mô tả sự cố')).toBeOnTheScreen();
      expect(screen.getByText('Đặt lịch thợ')).toBeOnTheScreen();
      expect(screen.getAllByText('Mã dịch vụ: srv-01').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('booking-next-btn')).toBeOnTheScreen();
    });

    it('navigates to select address when pressing Next button', () => {
      render(<CustomerBookingScreen />);

      const nextBtn = screen.getByTestId('booking-next-btn');
      fireEvent.press(nextBtn);
      expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-address');
    });

    it('navigates back when pressing back button in booking screen', () => {
      render(<CustomerBookingScreen />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerBookingSelectAddressScreen (booking/select-address)', () => {
    it('renders select address skeleton and navigates to select time on confirm with valid address', () => {
      render(<CustomerBookingSelectAddressScreen />);

      expect(screen.getByText('Chọn địa chỉ')).toBeOnTheScreen();
      expect(screen.getByTestId('gps-status-badge')).toBeOnTheScreen();
      expect(screen.getByTestId('locate-me-btn')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByTestId('booking-address-input'), '123 Nguyễn Lương Bằng, Đà Nẵng');
      fireEvent.press(screen.getByTestId('select-address-confirm-btn'));
      expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-time');
    });

    it('navigates to search address when pressing search another address button', () => {
      render(<CustomerBookingSelectAddressScreen />);

      fireEvent.press(screen.getByTestId('select-address-search-btn'));
      expect(mockPush).toHaveBeenCalledWith('/customer/search-address');
    });

    it('navigates back using app bar back button', () => {
      render(<CustomerBookingSelectAddressScreen />);

      fireEvent.press(screen.getByTestId('app-bar-back-btn'));
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerBookingSelectTimeScreen (booking/select-time)', () => {
    it('renders select time skeleton and navigates to summary on confirm', () => {
      render(<CustomerBookingSelectTimeScreen />);

      expect(screen.getByText('Chọn thời gian')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('select-time-confirm-btn'));
      expect(mockPush).toHaveBeenCalledWith('/customer/booking/summary');
    });

    it('navigates back using app bar back button', () => {
      render(<CustomerBookingSelectTimeScreen />);

      fireEvent.press(screen.getByTestId('app-bar-back-btn'));
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerBookingSummaryScreen (booking/summary)', () => {
    it('renders booking summary skeleton and navigates to radar on start finding', async () => {
      render(<CustomerBookingSummaryScreen />);

      expect(screen.getByText('Tóm tắt đơn đặt việc')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('booking-start-finding-btn'));
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/customer/booking/radar',
          params: { requestId: 'req-001' },
        });
      });
    });

    it('navigates back using app bar back button', () => {
      render(<CustomerBookingSummaryScreen />);

      fireEvent.press(screen.getByTestId('app-bar-back-btn'));
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerBookingRadarScreen (booking/radar)', () => {
    it('renders radar skeleton and navigates to worker profile on card click', () => {
      render(<CustomerBookingRadarScreen />);

      expect(screen.getByText('Tìm thợ radar')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('radar-worker-profile-btn'));
      expect(mockPush).toHaveBeenCalledWith('/customer/workers/th-01');
    });

    it('navigates back using app bar back button', () => {
      render(<CustomerBookingRadarScreen />);

      fireEvent.press(screen.getByTestId('app-bar-back-btn'));
      expect(mockBack).toHaveBeenCalled();
    });

    it('opens service order details modal when pressing document button', () => {
      render(<CustomerBookingRadarScreen />);

      const orderDetailsBtn = screen.getByTestId('radar-order-details-btn');
      fireEvent.press(orderDetailsBtn);

      expect(screen.getByText('Service order details')).toBeOnTheScreen();
      expect(screen.getByText('Estimated cost')).toBeOnTheScreen();
      expect(screen.getByText('Cancel order')).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('close-order-modal-btn'));
    });
  });

  describe('customerWorkerDetailScreen (workers/[id])', () => {
    it('renders worker profile placeholder frame and development notice', () => {
      mockParams = { id: 'th-01' };
      render(<CustomerWorkerDetailScreen />);

      expect(screen.getByText('Hồ sơ thợ')).toBeOnTheScreen();
      expect(screen.getByText('Mã thợ: #th-01')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('customerNotificationsScreen ((tabs)/notifications)', () => {
    it('renders notification inbox frame and app bar', () => {
      render(<CustomerNotificationsScreen />);

      expect(screen.getByText('Thông báo')).toBeOnTheScreen();
      expect(screen.getByText('Đăng nhập để xem thông báo')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-notifications-screen')).toBeOnTheScreen();
    });
  });

  describe('customerAiDiagnosisScreen (ai-diagnosis)', () => {
    it('renders AI feature placeholder frame with development notice', () => {
      render(<CustomerAiDiagnosisScreen />);

      expect(screen.getByText('AI phân tích sự cố')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-ai-diagnosis-screen')).toBeOnTheScreen();
    });
  });

  describe('customerUtilityAndFeatureScreens', () => {
    it('renders history skeleton screen', () => {
      render(<CustomerHistoryScreen />);
      expect(screen.getByText('Lịch sử')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-history-screen')).toBeOnTheScreen();
    });

    it('renders favorites skeleton screen', () => {
      render(<CustomerFavoritesScreen />);
      expect(screen.getByText('Yêu thích')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-favorites-screen')).toBeOnTheScreen();
    });

    it('renders referral skeleton screen', () => {
      render(<CustomerReferralScreen />);
      expect(screen.getByText('Giới thiệu bạn bè')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-referral-screen')).toBeOnTheScreen();
    });

    it('renders support skeleton screen', () => {
      render(<CustomerSupportScreen />);
      expect(screen.getByText('Hỗ trợ 24/7')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-support-screen')).toBeOnTheScreen();
    });

    it('renders ask-me AI assistant skeleton screen', () => {
      render(<CustomerAskMeScreen />);
      expect(screen.getByText('Trợ lý AI (Ask me)')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-ask-me-screen')).toBeOnTheScreen();
    });

    it('renders search address skeleton screen', () => {
      render(<CustomerSearchAddressScreen />);
      expect(screen.getByText('Tìm kiếm địa chỉ')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-search-address-screen')).toBeOnTheScreen();
    });

    it('renders chat skeleton screen', () => {
      render(<CustomerChatScreen />);
      expect(screen.getByText('Trò chuyện')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-chat-screen')).toBeOnTheScreen();
    });
  });

  describe('customerSettingsScreen (settings & logout confirmation)', () => {
    it('renders settings options: change password, biometrics toggle, and logout button', () => {
      render(<CustomerSettingsScreen />);

      expect(screen.getByText('Cài đặt')).toBeOnTheScreen();
      expect(screen.getByTestId('settings-change-password-btn')).toBeOnTheScreen();
      expect(screen.getByTestId('settings-biometrics-switch')).toBeOnTheScreen();
      expect(screen.getByTestId('settings-push-switch')).toBeOnTheScreen();
      expect(screen.getByTestId('settings-inapp-switch')).toBeOnTheScreen();
      expect(screen.getByTestId('settings-email-switch')).toBeOnTheScreen();
      expect(screen.getByTestId('settings-logout-btn')).toBeOnTheScreen();
    });

    it('navigates to change password flow when pressing change password button', () => {
      render(<CustomerSettingsScreen />);

      fireEvent.press(screen.getByTestId('settings-change-password-btn'));
      expect(mockPush).toHaveBeenCalledWith('/(auth)/change-password');
    });

    it('opens logout confirmation modal, cancels, and confirms logout back to guest home', async () => {
      const logoutSpy = jest.fn().mockResolvedValue(undefined);
      useAuthStore.setState({ logout: logoutSpy } as any);

      render(<CustomerSettingsScreen />);

      // Press logout button to trigger confirmation modal (Màn 13 Vua Thợ)
      fireEvent.press(screen.getByTestId('settings-logout-btn'));
      expect(screen.getByTestId('logout-confirm-modal')).toBeOnTheScreen();
      expect(screen.getByText('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản HandyGo không?')).toBeOnTheScreen();

      // Press cancel
      fireEvent.press(screen.getByTestId('logout-cancel-btn'));

      // Press logout again and confirm
      fireEvent.press(screen.getByTestId('settings-logout-btn'));
      fireEvent.press(screen.getByTestId('logout-confirm-btn'));

      await waitFor(() => {
        expect(logoutSpy).toHaveBeenCalled();
        expect(mockReplace).toHaveBeenCalledWith('/customer');
      });
    });
  });
});
