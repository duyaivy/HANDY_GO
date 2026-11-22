import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { CustomerOrderHistoryScreen } from '../screens/customer-order-history-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRefetch = jest.fn();
const mockFetchNextPage = jest.fn();

const mockOrders = [
  {
    id: 'ord-comp-1',
    orderCode: 'HDG-1001',
    serviceId: 'srv-01',
    agreedPrice: 250000,
    agreedScope: 'Sửa ống nước',
    addressText: '100 Lê Duẩn, Đà Nẵng',
    status: 'completed',
    paymentState: 'paid',
    completedAt: '2026-11-20T10:00:00.000Z',
    createdAt: '2026-11-20T08:00:00.000Z',
  },
  {
    id: 'ord-canc-1',
    orderCode: 'HDG-1002',
    serviceId: 'srv-ac',
    agreedPrice: 400000,
    agreedScope: 'Sửa máy lạnh',
    addressText: '200 Hải Phòng, Đà Nẵng',
    status: 'cancelled',
    paymentState: 'refunded',
    cancelReason: 'Khách bận đột xuất',
    cancelledAt: '2026-11-19T14:30:00.000Z',
    createdAt: '2026-11-19T14:00:00.000Z',
  },
];

const mockRequests = [
  {
    id: 'req-canc-1',
    requestCode: 'REQ-5001',
    serviceId: 'srv-01',
    description: 'Cần sửa vòi rửa chén rò rỉ',
    status: 'cancelled',
    cancelledAt: '2026-11-18T09:00:00.000Z',
    createdAt: '2026-11-18T08:30:00.000Z',
    addressText: '50 Nguyễn Văn Linh, Đà Nẵng',
  },
];

let mockHookReturn = {
  orders: mockOrders,
  requests: mockRequests,
  isLoading: false,
  isError: false,
  refetch: mockRefetch,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: mockFetchNextPage,
};

jest.mock('../../hooks/use-customer-orders', () => ({
  useCustomerOrders: () => mockHookReturn,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockHookReturn = {
    orders: mockOrders,
    requests: mockRequests,
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mockFetchNextPage,
  };
});

describe('customerOrderHistoryScreen', () => {
  it('renders app bar, summary banner, tabs and order list', () => {
    render(<CustomerOrderHistoryScreen />);

    expect(screen.getByText('Lịch sử đơn hàng')).toBeOnTheScreen();
    expect(screen.getByTestId('order-history-app-bar')).toBeOnTheScreen();
    expect(screen.getByText('Tổng đơn hoàn thành')).toBeOnTheScreen();
    expect(screen.getByText('1 dịch vụ')).toBeOnTheScreen();

    // Check tabs
    expect(screen.getByTestId('history-tab-all')).toBeOnTheScreen();
    expect(screen.getByTestId('history-tab-completed')).toBeOnTheScreen();
    expect(screen.getByTestId('history-tab-cancelled')).toBeOnTheScreen();

    // Check items rendered
    expect(screen.getByTestId('history-order-card-ord-comp-1')).toBeOnTheScreen();
    expect(screen.getByTestId('history-order-card-ord-canc-1')).toBeOnTheScreen();
    expect(screen.getByTestId('history-request-card-req-canc-1')).toBeOnTheScreen();
  });

  it('filters to completed orders when "Hoàn thành" tab is pressed', () => {
    render(<CustomerOrderHistoryScreen />);

    fireEvent.press(screen.getByTestId('history-tab-completed'));

    expect(screen.getByTestId('history-order-card-ord-comp-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('history-order-card-ord-canc-1')).toBeNull();
    expect(screen.queryByTestId('history-request-card-req-canc-1')).toBeNull();
  });

  it('filters to cancelled orders and requests when "Đã hủy" tab is pressed', () => {
    render(<CustomerOrderHistoryScreen />);

    fireEvent.press(screen.getByTestId('history-tab-cancelled'));

    expect(screen.queryByTestId('history-order-card-ord-comp-1')).toBeNull();
    expect(screen.getByTestId('history-order-card-ord-canc-1')).toBeOnTheScreen();
    expect(screen.getByTestId('history-request-card-req-canc-1')).toBeOnTheScreen();
  });

  it('navigates to order detail when pressing "Chi tiết"', () => {
    render(<CustomerOrderHistoryScreen />);

    fireEvent.press(screen.getByTestId('view-detail-btn-ord-comp-1'));
    expect(mockPush).toHaveBeenCalledWith('/customer/orders/ord-comp-1');
  });

  it('navigates to booking screen when pressing "Đặt lại"', () => {
    render(<CustomerOrderHistoryScreen />);

    fireEvent.press(screen.getByTestId('rebook-btn-ord-comp-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/booking',
      params: { serviceId: 'srv-01' },
    });
  });

  it('renders empty state when there are no historical orders', () => {
    mockHookReturn = {
      orders: [],
      requests: [],
      isLoading: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    expect(screen.getByTestId('history-empty-state')).toBeOnTheScreen();
    expect(screen.getByText('Chưa có đơn hàng nào')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('history-book-now-btn'));
    expect(mockPush).toHaveBeenCalledWith('/customer');
  });

  it('triggers auto infinite scroll when scrolling close to bottom', () => {
    mockHookReturn = {
      orders: mockOrders,
      requests: mockRequests,
      isLoading: false,
      refetch: mockRefetch,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    const scrollView = screen.getByTestId('customer-history-scroll-view');
    fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { y: 600 },
        contentSize: { height: 1000, width: 400 },
        layoutMeasurement: { height: 500, width: 400 },
      },
    });

    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('renders auto infinite loading indicator when isFetchingNextPage is true', () => {
    mockHookReturn = {
      orders: mockOrders,
      requests: mockRequests,
      isLoading: false,
      refetch: mockRefetch,
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    expect(screen.getByTestId('history-loading-more-indicator')).toBeOnTheScreen();
    expect(screen.getByText('Đang tải thêm đơn hàng...')).toBeOnTheScreen();
  });

  it('filters orders by search keyword and clears search when clear button is pressed', () => {
    render(<CustomerOrderHistoryScreen />);

    const searchInput = screen.getByTestId('history-search-input');
    fireEvent.changeText(searchInput, 'máy lạnh');

    // Only ord-canc-1 (Sửa máy lạnh) should remain
    expect(screen.getByTestId('history-order-card-ord-canc-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('history-order-card-ord-comp-1')).toBeNull();

    // Clear search
    const clearBtn = screen.getByTestId('clear-search-btn');
    fireEvent.press(clearBtn);

    // All orders restored
    expect(screen.getByTestId('history-order-card-ord-comp-1')).toBeOnTheScreen();
    expect(screen.getByTestId('history-order-card-ord-canc-1')).toBeOnTheScreen();
  });

  it('shows search-empty-state when no orders match keyword and clears search on button tap', () => {
    render(<CustomerOrderHistoryScreen />);

    const searchInput = screen.getByTestId('history-search-input');
    fireEvent.changeText(searchInput, 'từ khóa không tồn tại');

    expect(screen.getByTestId('search-empty-state')).toBeOnTheScreen();
    expect(screen.getByText('Không tìm thấy kết quả')).toBeOnTheScreen();

    // Tap clear button in empty state
    fireEvent.press(screen.getByTestId('clear-search-result-btn'));

    expect(screen.queryByTestId('search-empty-state')).toBeNull();
    expect(screen.getByTestId('history-order-card-ord-comp-1')).toBeOnTheScreen();
  });

  it('renders cancelReason for cancelled orders', () => {
    render(<CustomerOrderHistoryScreen />);
    expect(screen.getByText('Lý do hủy: Khách bận đột xuất')).toBeOnTheScreen();
  });

  it('renders search results count indicator during search', () => {
    render(<CustomerOrderHistoryScreen />);
    const searchInput = screen.getByTestId('history-search-input');
    fireEvent.changeText(searchInput, 'máy lạnh');

    expect(screen.getByTestId('search-results-count')).toBeOnTheScreen();
    expect(screen.getByText('Tìm thấy 1 kết quả phù hợp')).toBeOnTheScreen();
  });

  it('renders error state when isError is true and calls refetch on retry tap', async () => {
    mockHookReturn = {
      orders: [],
      requests: [],
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    expect(screen.getByTestId('history-error-state')).toBeOnTheScreen();
    expect(screen.getByText('Không thể tải dữ liệu')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('history-retry-btn'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
