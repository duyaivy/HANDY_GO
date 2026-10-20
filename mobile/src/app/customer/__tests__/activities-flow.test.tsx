/* eslint-disable max-lines-per-function */
/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { WorkerDetailScreen } from '@/features/catalog';
import { CustomerOrderDetailScreen, CustomerOrdersScreen } from '@/features/orders/customer';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import CustomerOrdersTabRoute from '../(tabs)/orders';
import CustomerOrderDetailRoute from '../orders/[id]';
import CustomerWorkerDetailRoute from '../workers/[id]';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: mockBack,
};

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockParams = {};
});

describe('activities feature skeleton and navigation flow', () => {
  describe('page 1: Activities (/customer/orders)', () => {
    it('renders Activities title, filter tabs, and Plumber (#224466) card', () => {
      render(<CustomerOrdersTabRoute />);

      // Title & subtitle
      expect(screen.getByText('Activities')).toBeOnTheScreen();
      expect(screen.getByText('Hoạt động')).toBeOnTheScreen();

      // 6 Filter tabs: Searching, In process, Reorder, All, Finished, Cancelled
      expect(screen.getByText('Searching')).toBeOnTheScreen();
      expect(screen.getByText('In process')).toBeOnTheScreen();
      expect(screen.getByText('Reorder')).toBeOnTheScreen();
      expect(screen.getByText('All')).toBeOnTheScreen();
      expect(screen.getByText('Finished')).toBeOnTheScreen();
      expect(screen.getByText('Cancelled')).toBeOnTheScreen();

      // Plumber order card
      expect(screen.getByText('Plumber')).toBeOnTheScreen();
      expect(screen.getByText('#224466')).toBeOnTheScreen();
      expect(screen.getByTestId('view-quotes-btn')).toBeOnTheScreen();
      expect(screen.getByText('View 1 quotes')).toBeOnTheScreen();
    });

    it('allows switching between filter tabs without route transition', () => {
      render(<CustomerOrdersScreen />);

      const inProcessTab = screen.getByTestId('activity-filter-tab-in-process');
      fireEvent.press(inProcessTab);

      // Remains on Activities without calling router
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('navigates to Chi tiết báo giá dịch vụ when pressing "View 1 quotes"', () => {
      render(<CustomerOrdersScreen />);

      const viewQuotesBtn = screen.getByTestId('view-quotes-btn');
      fireEvent.press(viewQuotesBtn);

      expect(mockPush).toHaveBeenCalledWith('/customer/orders/224466');
    });
  });

  describe('page 2: Chi tiết báo giá dịch vụ (Plumber) (/customer/orders/[id])', () => {
    it('renders Chi tiết báo giá dịch vụ (Plumber) for order #224466 with worker section', () => {
      mockParams = { id: '224466' };
      render(<CustomerOrderDetailRoute />);

      expect(screen.getByText('Chi tiết báo giá dịch vụ (Plumber)')).toBeOnTheScreen();
      expect(screen.getByText('A CẢNH VĂN')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-profile-btn')).toBeOnTheScreen();
      expect(screen.getByText('Worker profile')).toBeOnTheScreen();
    });

    it('navigates to Worker profile when pressing "Worker profile" button', () => {
      render(<CustomerOrderDetailScreen orderId="224466" />);

      const workerProfileBtn = screen.getByTestId('worker-profile-btn');
      fireEvent.press(workerProfileBtn);

      expect(mockPush).toHaveBeenCalledWith('/customer/workers/a-canh-van');
    });

    it('navigates back to Activities when pressing AppBar Back button', () => {
      render(<CustomerOrderDetailScreen orderId="224466" />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);

      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('page 3: Hồ sơ thợ / Worker profile (A CẢNH VĂN) (/customer/workers/[id])', () => {
    it('renders Worker profile for A CẢNH VĂN', () => {
      mockParams = { id: 'a-canh-van' };
      render(<CustomerWorkerDetailRoute />);

      expect(screen.getByText('Hồ sơ thợ / Worker profile (A CẢNH VĂN)')).toBeOnTheScreen();
      expect(screen.getByText('A CẢNH VĂN')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
    });

    it('navigates back to Chi tiết báo giá dịch vụ when pressing AppBar Back button', () => {
      render(<WorkerDetailScreen workerId="a-canh-van" />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);

      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('full 5-step navigation flow simulation', () => {
    it('executes the complete sequence: Activities -> Chi tiết báo giá -> Hồ sơ thợ -> Back -> Back', () => {
      // Step 1: User opens Activities screen
      const { unmount: unmountActivities } = render(<CustomerOrdersTabRoute />);
      expect(screen.getByText('Activities')).toBeOnTheScreen();

      // Step 2: Press "View 1 quotes" on Plumber card (#224466) -> opens Chi tiết báo giá
      const viewQuotesBtn = screen.getByTestId('view-quotes-btn');
      fireEvent.press(viewQuotesBtn);
      expect(mockPush).toHaveBeenCalledWith('/customer/orders/224466');
      unmountActivities();

      // Step 3: Open Chi tiết báo giá dịch vụ (#224466) and press "Worker profile" -> opens Hồ sơ thợ
      mockParams = { id: '224466' };
      const { unmount: unmountQuoteDetail } = render(<CustomerOrderDetailRoute />);
      expect(screen.getByText('Chi tiết báo giá dịch vụ (Plumber)')).toBeOnTheScreen();
      const workerProfileBtn = screen.getByTestId('worker-profile-btn');
      fireEvent.press(workerProfileBtn);
      expect(mockPush).toHaveBeenCalledWith('/customer/workers/a-canh-van');
      unmountQuoteDetail();

      // Step 4: On Hồ sơ thợ (A CẢNH VĂN), press Back -> returns to Chi tiết báo giá dịch vụ
      mockParams = { id: 'a-canh-van' };
      const { unmount: unmountWorkerProfile } = render(<CustomerWorkerDetailRoute />);
      expect(screen.getByText('Hồ sơ thợ / Worker profile (A CẢNH VĂN)')).toBeOnTheScreen();
      const backOnWorkerBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backOnWorkerBtn);
      expect(mockBack).toHaveBeenCalledTimes(1);
      unmountWorkerProfile();

      // Step 5: On Chi tiết báo giá dịch vụ, press Back -> returns to Activities
      mockParams = { id: '224466' };
      render(<CustomerOrderDetailRoute />);
      const backOnQuoteBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backOnQuoteBtn);
      expect(mockBack).toHaveBeenCalledTimes(2);
    });
  });
});
