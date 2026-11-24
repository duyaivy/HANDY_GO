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

let mockHookReturn: any = {
  orders: mockOrders,
  requests: mockRequests,
  totalCompletedCount: 1,
  isLoading: false,
  isError: false,
  refetch: mockRefetch,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: mockFetchNextPage,
};

const mockHookFn = jest.fn((..._args: any[]) => mockHookReturn);

jest.mock('../../hooks/use-customer-order-history', () => ({
  useCustomerOrderHistory: (...args: any[]) => mockHookFn(...args),
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
    totalCompletedCount: 1,
    isStatsLoading: false,
    isStatsError: false,
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
      isError: false,
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
      isError: false,
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
      isError: false,
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

  it('renders expired service request with "Đã hết hạn" badge and expiration timestamp (HG-72 P2)', () => {
    mockHookReturn = {
      orders: [],
      requests: [
        {
          id: 'req-exp-1',
          requestCode: 'REQ-EXP-99',
          serviceId: 'srv-01',
          description: 'Yêu cầu sửa khóa cửa đã hết hạn',
          status: 'expired',
          selectionExpiresAt: '2026-11-21T18:00:00.000Z',
          createdAt: '2026-11-21T10:00:00.000Z',
          addressText: '456 Hoàng Diệu, Đà Nẵng',
        },
      ],
      totalCompletedCount: 0,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    expect(screen.getByText('Đã hết hạn')).toBeOnTheScreen();
    expect(screen.getByText(/Hết hạn lúc:/)).toBeOnTheScreen();
    expect(screen.getByTestId('history-request-card-req-exp-1')).toBeOnTheScreen();
  });

  it('falls back to "Không rõ thời gian" when expired request has no expiration timestamp (HG-72 P2)', () => {
    mockHookReturn = {
      orders: [],
      requests: [
        {
          id: 'req-exp-no-time',
          requestCode: 'REQ-EXP-00',
          serviceId: 'srv-01',
          description: 'Hết hạn không có mốc giờ',
          status: 'expired',
          createdAt: '2026-11-21T10:00:00.000Z',
          addressText: 'Đà Nẵng',
        },
      ],
      totalCompletedCount: 0,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    expect(screen.getByText('Đã hết hạn')).toBeOnTheScreen();
    expect(screen.getByText(/Hết hạn lúc: Không rõ thời gian/)).toBeOnTheScreen();
  });

  it('renders completed order when server filters 10 active + 1 completed order (HG-72 P1)', () => {
    mockHookReturn = {
      orders: [
        {
          id: 'ord-comp-old',
          orderCode: 'HDG-OLDER',
          serviceId: 'srv-01',
          agreedPrice: 500000,
          agreedScope: 'Bảo trì đường điện cũ',
          addressText: 'Đà Nẵng',
          status: 'completed',
          paymentState: 'paid',
          completedAt: '2026-11-01T10:00:00.000Z',
          createdAt: '2026-11-01T08:00:00.000Z',
        },
      ],
      requests: [],
      totalCompletedCount: 1,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    expect(screen.getByTestId('history-order-card-ord-comp-old')).toBeOnTheScreen();
    expect(screen.getByText(/HDG-OLDER/)).toBeOnTheScreen();
    expect(screen.queryByTestId('history-empty-state')).toBeNull();
  });

  it('keeps totalCompletedCount stable across tab switches (HG-72 P1)', () => {
    mockHookReturn = {
      orders: mockOrders,
      requests: mockRequests,
      totalCompletedCount: 42,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    // In 'all' tab
    expect(screen.getByText('42 dịch vụ')).toBeOnTheScreen();

    // Switch to 'cancelled' tab
    fireEvent.press(screen.getByTestId('history-tab-cancelled'));
    expect(screen.getByText('42 dịch vụ')).toBeOnTheScreen();
  });

  it('paginates requests when requests > 10 and orders = 0 (HG-72 P1)', () => {
    mockHookReturn = {
      orders: [],
      requests: mockRequests,
      totalCompletedCount: 0,
      isStatsLoading: false,
      isStatsError: false,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    // Load more button must be rendered for paginated requests
    const loadMoreBtn = screen.getByTestId('history-load-more-btn');
    expect(loadMoreBtn).toBeOnTheScreen();

    fireEvent.press(loadMoreBtn);
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('passes search query to useCustomerOrderHistory for server-side search across pages (HG-72 P2)', () => {
    render(<CustomerOrderHistoryScreen />);

    const searchInput = screen.getByTestId('history-search-input');
    fireEvent.changeText(searchInput, 'vòi nước');

    expect(mockHookFn).toHaveBeenCalledWith('all', 'vòi nước');
  });

  it('displays "--" when summary fails or is unavailable without falling back to currently loaded orders (HG-72 P2)', () => {
    mockHookReturn = {
      orders: mockOrders,
      requests: mockRequests,
      totalCompletedCount: null,
      isStatsLoading: false,
      isStatsError: true,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    const countElement = screen.getByTestId('customer-history-completed-count');
    expect(countElement).toHaveTextContent('--');
  });

  it('excludes disputed orders from "Đã hủy" tab, strictly showing only cancelled (HG-72 P2)', () => {
    const ordersWithDispute = [
      {
        id: 'ord-canc-pure',
        orderCode: 'HDG-CANC-1',
        serviceId: 'srv-01',
        agreedPrice: 200000,
        agreedScope: 'Sửa điện',
        addressText: 'Đà Nẵng',
        status: 'cancelled',
        paymentState: 'refunded',
        createdAt: '2026-11-20T10:00:00.000Z',
      },
      {
        id: 'ord-disp-1',
        orderCode: 'HDG-DISP-1',
        serviceId: 'srv-02',
        agreedPrice: 300000,
        agreedScope: 'Sơn tường',
        addressText: 'Đà Nẵng',
        status: 'disputed',
        paymentState: 'holding',
        createdAt: '2026-11-20T11:00:00.000Z',
      },
    ];

    mockHookReturn = {
      orders: ordersWithDispute,
      requests: [],
      totalCompletedCount: 0,
      isStatsLoading: false,
      isStatsError: false,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<CustomerOrderHistoryScreen />);

    fireEvent.press(screen.getByTestId('history-tab-cancelled'));

    expect(screen.getByTestId('history-order-card-ord-canc-pure')).toBeOnTheScreen();
    expect(screen.queryByTestId('history-order-card-ord-disp-1')).toBeNull();
  });
});
